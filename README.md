# Program 2 in Computer Graphics Course (CSC561)

helper files for the intro cg class's second programming assignment

Part 1: Render the input triangles, without lighting
Use rasterization to render unlit triangles, giving each triangle its unmodified diffuse color (e.g, if the diffuse color of the triangle is (1,0,0), every pixel in it should be red). You will have to use vertex shaders to perform viewing and perspective transforms, and fragment shaders to select the diffuse color. We recommend the use of the glMatrix library for creating these transforms.

Part 2: Render the input ellipsoids, without lighting
Use rasterization to render unlit ellipsoids, giving each ellipsoid its unmodified diffuse color. There are no ellipsoid primitives available in WebGL, so you will have to build an ellipsoid out of triangles, then transform it to the right location and size. You can do this statically with a hardcoded sphere model, or procedurally with a latitude/longitude parameterization. You then scale this sphere to match its ellipsoidal parameters. Again you will have to use vertex shaders to perform viewing and perspective transforms, fragment shaders to select color.

Part 3: Light the ellipsoids and triangles
Shade the ellipsoids and triangles using per-fragment shading and the Blinn-Phong illumination model, using the reflectivity coefficients you find in the input files. Use triangle normals during lighting (which will reveal faceting on your ellipsoids). Your fragment shaders will perform the lighting calculation.

Part 4: interactively change view
Use the following key to action table to enable the user to change the view:
a and d — translate view left and right along view X
w and s — translate view forward and backward along view Z
q and e — translate view up and down along view Y
A and D — rotate view left and right around view Y (yaw)
W and S — rotate view forward and backward around view X (pitch)
To implement these changes you will need to change the eye, lookAt and lookUp vectors used to form your viewing transform.

Part 5: Interactively select a model
Use the following key to action table to interactively select a certain model:
left and right — select and highlight the next/previous triangle set (previous off)
up and down — select and highlight the next/previous ellipsoid (previous off)
space — deselect and turn off highlight
A triangle set is one entry in the input triangle array. To highlight, uniformly scale the selection by 20% (multiply x y and z by 1.2). To turn highlighting off, remove this scaling. You will have to associate a transform matrix with each ellipsoid and triangle to maintain state, and apply this transform in your vertex shaders. glMatrix will also be helpful here.

Part 6: Interactively change lighting on a model
Use the following key to action table to interactively change lighting on the selected model:
b — toggle between Phong and Blinn-Phong lighting
n — increment the specular integer exponent by 1 (wrap from 20 to 0)
1 — increase the ambient weight by 0.1 (wrap from 1 to 0)
2 — increase the diffuse weight by 0.1 (wrap from 1 to 0)
3 — increase the specular weight by 0.1 (wrap from 1 to 0)
When toggling between Phong and Blinn-Phong, apply this change to globally to all models. All other changes should apply only to the selected model.

Part 7: Interactively transform models
Use the following key to action table to interactively transform the selected model:
k and ; — translate selection left and right along view X
o and l — translate selection forward and backward along view Z
i and p — translate selection up and down along view Y
K and : — rotate selection left and right around view Y (yaw)
O and L — rotate selection forward and backward around view X (pitch)
I and P — rotate selection clockwise and counterclockwise around view Z (roll)
Translate the model after you rotate it (so the model rotates around itself), and after the highlighting scale (see above, so the model doesn't translate as it scales).
