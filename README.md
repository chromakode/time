# Time

Time is a serial art project consisting of interactive seekable animations.
Each piece is intended to be viewed in a web browser on a mobile phone or
desktop computer.

This has been a learning project about WebGL for me. If you have any
suggestions for ways to improve the techniques here, please reach out!


## Technical details

This repo implements a roughly WYSIWYG workflow for web animations created
using [Blender](https://www.blender.org). Art files are created in Blender and
then data is exported using the code in `src/loaders/blender-loader/`. This
data is displayed in WebGL using [regl](https://github.com/regl-project/regl)
by the code in `src/loaders/time-loader/`.

In order to use Blender's bezier-based animation data natively, curve control
points are exported and then evaluated using a [port of Blender's fcurve
internals](https://github.com/chromakode/fcurve). Similarly, for smooth meshes,
Blender's subdivision surfaces are reproduced on the client side using
[Erkaman's gl-catmull-clark](https://github.com/chromakode/gl-catmull-clark)
library.
