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


def get_anim_data(thing):
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


_id = 0
def get_obj_id(obj):
    global _id
    if 'time_id' not in obj:
        _id += 1
        obj['time_id'] = str(_id)
    return obj['time_id']


def get_obj_data(obj):
    obj_data = {}
    if obj.parent:
        obj_data['parent'] = get_obj_id(obj.parent)
    obj_data['id'] = get_obj_id(obj)
    obj_data['type'] = obj.type.lower()
    obj_data['anim'] = get_anim_data(obj)
    return obj_data


def main():
    scene = bpy.data.scenes[0]

    data = {}
    data['start'] = scene.frame_start
    data['end'] = scene.frame_end
    data['title'] = scene['title']
    data['bg'] = {'color': list(scene.world.horizon_color)}
    obj_datas = data['objs'] = []

    camera_data = get_obj_data(scene.camera)
    camera_data['perspective'] = [s for v in scene.camera.calc_matrix_camera(1, 1).transposed() for s in v]
    obj_datas.append(camera_data)
    data['camera'] = get_obj_id(scene.camera)

    for obj in scene.objects:
        if obj.type == 'EMPTY':
            obj_datas.append(get_obj_data(obj))
        elif obj.type == 'MESH':
            obj_data = get_obj_data(obj)
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

            if obj.data.shape_keys:
                obj_sks = obj_data['shapes'] = []
                obj_data['anim']['shapes'] = {'type': 'anim'}
                obj_sk_curves = obj_data['anim']['shapes']['data'] = []
                for idx, key_block in enumerate(obj.data.shape_keys.key_blocks[1:]):
                    sk_verts = [list(v.co) for v in key_block.data]
                    obj_sks.append(sk_verts)

                    fcurve = obj.data.shape_keys.animation_data.action.fcurves[idx]
                    obj_sk_curves.append(curve_to_json(fcurve))

    objs_by_id = {obj['id']: obj for obj in obj_datas}

    # Sort objects so that parents are before their children
    def parent_depth(obj_data):
        depth = 0
        cur = obj_data
        while 'parent' in cur:
            depth += 1
            cur = objs_by_id[cur['parent']]
        return depth
    obj_datas.sort(key=parent_depth)

    json.dump(data, os.fdopen(3, 'w'))

if __name__ == "__main__":
    main()
