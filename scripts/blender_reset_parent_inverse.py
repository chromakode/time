import bpy


class ResetParentInverse(bpy.types.Operator):
    """Resets an object's parent_inverse_matrix, retaining transform."""
    bl_idname = "chromakode.reset_parent_inverse"
    bl_label = "Reset Parent Inverse"

    def execute(self, context):
        # via https://blender.stackexchange.com/a/28897/41041
        for obj in context.selected_objects:
            matrix_orig = obj.matrix_world.copy()
            obj.matrix_parent_inverse.identity()
            obj.matrix_basis = obj.parent.matrix_world.inverted() * matrix_orig
        return {'FINISHED'}


bpy.utils.register_class(ResetParentInverse)
