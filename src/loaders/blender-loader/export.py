import sys
import os
import json
from os import path
from itertools import groupby

import bpy
import bmesh
from mathutils import Matrix


def curve_to_json(curve):
    json_points = []
    for point in curve.keyframe_points:
        json_point = {
            'interpolation': point.interpolation,
            'co': [
                point.co.x,
                point.co.y,
            ],
            'left': [
                point.handle_left.x,
                point.handle_left.y,
            ],
            'right': [
                point.handle_right.x,
                point.handle_right.y,
            ],
        }
        json_points.append(json_point)

    return {'points': json_points}


def anim_data(thing):
    mappings = {'location': 'loc', 'rotation_quaternion': 'rot', 'scale': 'scale'}

    data = {}
    for from_name, dest_name in mappings.items():
        data[dest_name] = {'type': 'static', 'data': list(getattr(thing, from_name))}

    if thing.animation_data and thing.animation_data.action:
        for name, curves in groupby(thing.animation_data.action.fcurves, lambda c: c.data_path):
            if name in mappings:
                data[mappings[name]] = {'type': 'anim', 'data': [curve_to_json(c) for c in curves]}

    # Blender orders quat components WXYZ. We use XYZW.
    data['rot']['data'] = data['rot']['data'][1:] + [data['rot']['data'][0]]

    return data


def main():
    scene = bpy.data.scenes[0]
    _id = 0

    data = {}
    data['start'] = scene.frame_start
    data['end'] = scene.frame_end
    data['title'] = scene['title']
    data['bg'] = {'color': list(scene.world.horizon_color)}

    # Bake "parent inverse matrix" into camera position so we don't need it in JS-land
    scene.camera.matrix_local = scene.camera.matrix_parent_inverse * scene.camera.matrix_local
    scene.camera.matrix_parent_inverse = Matrix.Identity(4)

    camera_data = data['camera'] = {}
    camera_data['id'] = str(_id)
    _id += 1
    camera_data['perspective'] = [s for v in scene.camera.calc_matrix_camera(1, 1).transposed() for s in v]
    camera_data['anim'] = anim_data(scene.camera)
    camera_data['pivot'] = {'id': _id, 'anim': anim_data(scene.camera.parent)}
    _id += 1

    obj_datas = data['objs'] = []
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj_data = {}
            obj_data['id'] = str(_id)
            _id += 1
            obj_positions = obj_data['positions'] = []
            obj_cells = obj_data['cells'] = []
            obj_datas.append(obj_data)

            for modifier in obj.modifiers:
                if modifier.type == 'SUBSURF' and modifier.subdivision_type == 'CATMULL_CLARK':
                    obj_data['subsurf'] = modifier.render_levels

            bm = bmesh.new()
            bm.from_mesh(obj.data)
            if 'subsurf' not in obj_data:
                bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method=0, ngon_method=0)
            for v in bm.verts:
                obj_positions.append(list(v.co))
            for face in bm.faces:
                obj_cells.append([v.index for v in face.verts])
            bm.free()

            mat = obj_data['mat'] = {}
            mat['color'] = list(obj.material_slots[0].material.diffuse_color)

            obj_data['anim'] = anim_data(obj)

            if obj.data.shape_keys:
                obj_sks = obj_data['shapes'] = []
                obj_data['anim']['shapes'] = {'type': 'anim'}
                obj_sk_curves = obj_data['anim']['shapes']['data'] = []
                for idx, key_block in enumerate(obj.data.shape_keys.key_blocks[1:]):
                    sk_verts = [list(v.co) for v in key_block.data]
                    obj_sks.append(sk_verts)

                    fcurve = obj.data.shape_keys.animation_data.action.fcurves[idx]
                    obj_sk_curves.append(curve_to_json(fcurve))

    json.dump(data, os.fdopen(3, 'w'))

if __name__ == "__main__":
    main()
