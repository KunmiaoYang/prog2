//region GLOBAL CONSTANTS AND VARIABLES
/* assignment specific globals */
const WIN_Z = 0;  // default graphics window z coord in world space
const WIN_LEFT = 0; const WIN_RIGHT = 1;  // default left and right x coords in world space
const WIN_BOTTOM = 0; const WIN_TOP = 1;  // default top and bottom y coords in world space
const INPUT_TRIANGLES_URL = "https://ncsucgclass.github.io/prog2/triangles.json"; // triangles file loc
const INPUT_SPHERES_URL = "https://ncsucgclass.github.io/prog2/ellipsoids.json"; // ellipsoids file loc
const DELTA_TRANS = 0.0125; const DELTA_ROT = 0.02;

var Eye = new vec4.fromValues(0.5,0.5,-0.5,1.0); // default eye position in world space
var LookAt = vec3.fromValues(0, 0, 1); // default eye look at direction in world space
var ViewUp = vec3.fromValues(0, 1, 0); // default eye view up direction in world space

/* webgl globals */
var gl = null; // the all powerful gl object. It's all here folks!
var shaderProgram;
var vertexBuffer; // this contains vertex coordinates in triples
var triangleBuffer; // this contains indices into vertexBuffer in triples
var triBufferSize = 0; // the number of indices in the triangle buffer
var vertexPositionAttrib; // where to put position for vertex shader
var vertexNormalAttrib; // where to put normal for vertex shader

var models = {};
models.selectId = -1;
models.array = [];
var triangleSets = {};
var ellipsoids = {};
var lightArray = [];
var useLight = true;
var lightsURL;

var camera = {};
var uniforms = {};

var currentlyPressedKeys = [];
//endregion

// ASSIGNMENT HELPER FUNCTIONS

//region Set up environment
// Load data from document
function loadDocumentInputs() {
    var canvas = document.getElementById("myWebGLCanvas"); // create a js canvas
    useLight = document.getElementById("UseLight").checked;
    lightsURL = document.getElementById("LightsURL").value;
    canvas.width = parseInt(document.getElementById("Width").value);
    canvas.height = parseInt(document.getElementById("Height").value);
    camera.left = parseFloat(document.getElementById("WLeft").value);
    camera.right = parseFloat(document.getElementById("WRight").value);
    camera.top = parseFloat(document.getElementById("WTop").value);
    camera.bottom = parseFloat(document.getElementById("WBottom").value);
    camera.near = parseFloat(document.getElementById("WNear").value);
    camera.far = parseFloat(document.getElementById("WFar").value);
}

// Set up key event
function setupKeyEvent() {
    document.onkeydown = handleKeyDown;
    document.onkeyup = handleKeyUp;
}

// Set up the webGL environment
function setupWebGL() {

    // Get the canvas and context
    var canvas = document.getElementById("myWebGLCanvas"); // create a js canvas
    gl = canvas.getContext("webgl"); // get a webgl object from it
    gl.viewportWidth = canvas.width; // store width
    gl.viewportHeight = canvas.height; // store height
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    try {
      if (gl == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
        gl.clearDepth(1.0); // use max when we clear the depth buffer
        gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
      }
    } // end try
    
    catch(e) {
      console.log(e);
    } // end catch
 
} // end setupWebGL

// Set up the webGL shaders
function setupShaders() {

    // define fragment shader in essl using es6 template strings
    var fShaderCode = `
        
        precision mediump float;
        struct light_struct {
          vec3 xyz;
          vec3 ambient;
          vec3 diffuse;
          vec3 specular;
        };
        struct material_struct {
          vec3 ambient;
          vec3 diffuse;
          vec3 specular;
          float n;
        };
        
        uniform light_struct uLights[N_LIGHT];
        uniform material_struct uMaterial;
        uniform int uLightModel;
        
        varying vec3 vTransformedNormal;
        varying vec4 vPosition;
        varying vec3 vCameraDirection;

        void main(void) {
            vec3 rgb = vec3(0, 0, 0);
            
            if(uLightModel < 0) {
                rgb = uMaterial.diffuse;
            } else {
                for(int i = 0; i < N_LIGHT; i++) {
                    vec3 L = normalize(uLights[i].xyz - vPosition.xyz);
                    vec3 V = normalize(vCameraDirection);
                    vec3 N = normalize(vTransformedNormal);
                    float dVN = dot(V, N);
                    float dLN = dot(L, N);
                    rgb += uMaterial.ambient * uLights[i].ambient; // Ambient shading
                    if(dLN > 0.0 && dVN > 0.0) {
                        rgb += dLN * (uMaterial.diffuse * uLights[i].diffuse);      // Diffuse shading
                        if(0 == uLightModel) {          // Phong specular shading
                            vec3 R = normalize(2.0 * dot(N, L) * N - L);
                            float weight = pow(dot(V, R), uMaterial.n);
                            if(weight > 0.0) rgb += weight * (uMaterial.specular * uLights[i].specular);
                        } else if(1 == uLightModel) {          // Blinn-Phong specular shading
                            vec3 H = normalize(V + L);
                            float weight = pow(dot(N, H), uMaterial.n);
                            if(weight > 0.0) rgb += weight * (uMaterial.specular * uLights[i].specular);
                        }
                    }
                }
            }
            gl_FragColor = vec4(rgb, 1); // all fragments are white
        }
    `;
    fShaderCode = "#define N_LIGHT " + lightArray.length + "\n" + fShaderCode;

    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 vertexPosition;
        attribute vec3 vertexNormal;

        uniform mat4 uMMatrix;      // Model transformation
        uniform mat4 uVMatrix;      // Viewing transformation
        uniform mat4 uPMatrix;      // Projection transformation
        uniform mat3 uNMatrix;      // Normal vector transformation
        uniform vec3 uCameraPos;    // Camera position
        uniform bool uDoubleSide;
        
        varying vec3 vTransformedNormal;
        varying vec4 vPosition;
        varying vec3 vCameraDirection;

        void main(void) {
            vPosition = uMMatrix * vec4(vertexPosition, 1.0);
            vCameraDirection = uCameraPos - vPosition.xyz;
            gl_Position = uPMatrix * uVMatrix * vPosition;
            vTransformedNormal = uNMatrix * vertexNormal;
            if(uDoubleSide && dot(vCameraDirection, vTransformedNormal) < 0.0)
                vTransformedNormal = -vTransformedNormal;
        }
    `;

    try {
        // console.log("fragment shader: "+fShaderCode);
        var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        // console.log("vertex shader: "+vShaderCode);
        var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution

        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);
            gl.deleteShader(vShader);
        } else { // no compile errors
            shaderProgram = gl.createProgram(); // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                gl.useProgram(shaderProgram); // activate shader program (frag and vert)
                vertexPositionAttrib = // get pointer to vertex shader input
                    gl.getAttribLocation(shaderProgram, "vertexPosition");
                gl.enableVertexAttribArray(vertexPositionAttrib); // input to shader from array

                vertexNormalAttrib = gl.getAttribLocation(shaderProgram, "vertexNormal");
                gl.enableVertexAttribArray(vertexNormalAttrib); // input to shader from array

                // Get uniform matrices
                uniforms.lightModelUniform = gl.getUniformLocation(shaderProgram, "uLightModel");
                uniforms.cameraPosUniform = gl.getUniformLocation(shaderProgram, "uCameraPos");
                uniforms.mMatrixUniform = gl.getUniformLocation(shaderProgram, "uMMatrix");
                uniforms.vMatrixUniform = gl.getUniformLocation(shaderProgram, "uVMatrix");
                uniforms.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
                uniforms.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
                uniforms.doubleSideUniform = gl.getUniformLocation(shaderProgram, "uDoubleSide");
                uniforms.materialUniform = getMaterialUniformLocation(shaderProgram, "uMaterial");
                uniforms.lightUniformArray = [];
                for (let i = 0; i < lightArray.length; i++) {
                    uniforms.lightUniformArray[i] = getLightUniformLocation(shaderProgram, "uLights[" + i + "]");
                }
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try

    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders
//endregion

//region Handle events
function handleKeyDown(event) {
    currentlyPressedKeys[event.keyCode] = true;

    // Part 4: interactively change view
    // Part 5: Interactively select a model
    switch(event.key) {
        case "a":    // a — translate view left along view X
            translateCamera(vec3.fromValues(-DELTA_TRANS, 0, 0));
            renderTriangles();
            return;
        case "d":    // d — translate view right along view X
            translateCamera(vec3.fromValues(DELTA_TRANS, 0, 0));
            renderTriangles();
            return;
        case "w":    // w — translate view forward along view Z
            translateCamera(vec3.fromValues(0, 0, -DELTA_TRANS));
            renderTriangles();
            return;
        case "s":    // s — translate view backward along view Z
            translateCamera(vec3.fromValues(0, 0, DELTA_TRANS));
            renderTriangles();
            return;
        case "q":    // q — translate view up along view Y
            translateCamera(vec3.fromValues(0, DELTA_TRANS, 0));
            renderTriangles();
            return;
        case "e":    // e — translate view down along view Y
            translateCamera(vec3.fromValues(0, -DELTA_TRANS, 0));
            renderTriangles();
            return;
        case "A":    // A — rotate view left around view Y (yaw)
            rotateCamera(DELTA_ROT, vec3.fromValues(0, 1, 0));
            renderTriangles();
            return;
        case "D":    // D — rotate view right around view Y (yaw)
            rotateCamera(-DELTA_ROT, vec3.fromValues(0, 1, 0));
            renderTriangles();
            return;
        case "W":    // W — rotate view forward around view X (pitch)
            rotateCamera(DELTA_ROT, vec3.fromValues(1, 0, 0));
            renderTriangles();
            return;
        case "S":    // S — rotate view backward around view X (pitch)
            rotateCamera(-DELTA_ROT, vec3.fromValues(1, 0, 0));
            renderTriangles();
            return;
        case "ArrowLeft":    // left — select and highlight the previous triangle set (previous off)
            triangleSets.selectId = (triangleSets.selectId + triangleSets.array.length - 1) % triangleSets.array.length;
            models.selectId = triangleSets.array[triangleSets.selectId].id;
            renderTriangles();
            return;
        case "ArrowRight":    // right — select and highlight the next triangle set (previous off)
            triangleSets.selectId = (triangleSets.selectId + 1) % triangleSets.array.length;
            models.selectId = triangleSets.array[triangleSets.selectId].id;
            renderTriangles();
            return;
        case "ArrowUp":    // up — select and highlight the next ellipsoid (previous off)
            ellipsoids.selectId = (ellipsoids.selectId + 1) % ellipsoids.array.length;
            models.selectId = ellipsoids.array[ellipsoids.selectId].id;
            renderTriangles();
            return;
        case "ArrowDown":    // down — select and highlight the previous ellipsoid (previous off)
            ellipsoids.selectId = (ellipsoids.selectId + ellipsoids.array.length - 1) % ellipsoids.array.length;
            models.selectId = ellipsoids.array[ellipsoids.selectId].id;
            renderTriangles();
            return;
        case " ":    // space — deselect and turn off highlight
            models.selectId = -1;
            renderTriangles();
            return;
    }

    // Part 6: Interactively change lighting on a model
    // Part 7: Interactively transform models
    if (-1 !== models.selectId) {
        let model = models.array[models.selectId];
        switch (event.key) {
            case "b":    // b — toggle between Phong and Blinn-Phong lighting
                model.specularModel = 0 === model.specularModel ? 1 : 0;
                renderTriangles();
                return;
            case "n":   // n — increment the specular integer exponent by 1 (wrap from 20 to 0)
                model.material.n = (model.material.n + 1) % 21;
                renderTriangles();
                return;
            case "1":   // 1 — increase the ambient weight by 0.1 (wrap from 1 to 0)
                for (let i = 0; i < 3; i++) {
                    model.material.ambient[i] += 0.1;
                    if (model.material.ambient[i] > 1) model.material.ambient[i] = 0.0;
                }
                renderTriangles();
                return;
            case "2":   // 2 — increase the diffuse weight by 0.1 (wrap from 1 to 0)
                for (let i = 0; i < 3; i++) {
                    model.material.diffuse[i] += 0.1;
                    if (model.material.diffuse[i] > 1) model.material.diffuse[i] = 0.0;
                }
                renderTriangles();
                return;
            case "3":   // 3 — increase the specular weight by 0.1 (wrap from 1 to 0)
                for (let i = 0; i < 3; i++) {
                    model.material.specular[i] += 0.1;
                    if (model.material.specular[i] > 1) model.material.specular[i] = 0.0;
                }
                renderTriangles();
                return;
            case "k":   // k — translate selection left along view X
                mat4.translate(model.tMatrix, model.tMatrix, vec3.scale(vec3.create(), camera.X, -DELTA_TRANS));
                renderTriangles();
                return;
            case ";":   // ; — translate selection right along view X
                mat4.translate(model.tMatrix, model.tMatrix, vec3.scale(vec3.create(), camera.X, DELTA_TRANS));
                renderTriangles();
                return;
            case "o":   // o — translate selection forward along view Z
                mat4.translate(model.tMatrix, model.tMatrix, vec3.scale(vec3.create(), camera.Z, -DELTA_TRANS));
                renderTriangles();
                return;
            case "l":   // l — translate selection backward along view Z
                mat4.translate(model.tMatrix, model.tMatrix, vec3.scale(vec3.create(), camera.Z, DELTA_TRANS));
                renderTriangles();
                return;
            case "i":   // i — translate selection up along view Y
                mat4.translate(model.tMatrix, model.tMatrix, vec3.scale(vec3.create(), camera.Y, DELTA_TRANS));
                renderTriangles();
                return;
            case "p":   // p — translate selection down along view Y
                mat4.translate(model.tMatrix, model.tMatrix, vec3.scale(vec3.create(), camera.Y, -DELTA_TRANS));
                renderTriangles();
                return;
            case "K":   // K — rotate selection left around view Y (yaw)
                mat4.multiply(model.rMatrix, mat4.fromRotation(mat4.create(), -DELTA_ROT, camera.Y), model.rMatrix);
                renderTriangles();
                return;
            case ":":   // : — rotate selection right around view Y (yaw)
                mat4.multiply(model.rMatrix, mat4.fromRotation(mat4.create(), DELTA_ROT, camera.Y), model.rMatrix);
                renderTriangles();
                return;
            case "O":   // O — rotate selection forward around view X (pitch)
                mat4.multiply(model.rMatrix, mat4.fromRotation(mat4.create(), -DELTA_ROT, camera.X), model.rMatrix);
                renderTriangles();
                return;
            case "L":   // L — rotate selection backward around view X (pitch)
                mat4.multiply(model.rMatrix, mat4.fromRotation(mat4.create(), DELTA_ROT, camera.X), model.rMatrix);
                renderTriangles();
                return;
            case "I":   // I — rotate selection clockwise around view Z (roll)
                mat4.multiply(model.rMatrix, mat4.fromRotation(mat4.create(), -DELTA_ROT, camera.Z), model.rMatrix);
                renderTriangles();
                return;
            case "P":   // P — rotate selection counterclockwise around view Z (roll)
                mat4.multiply(model.rMatrix, mat4.fromRotation(mat4.create(), DELTA_ROT, camera.Z), model.rMatrix);
                renderTriangles();
                return;
        }
    }
}

function handleKeyUp(event) {
    currentlyPressedKeys[event.keyCode] = false;
}
//endregion

//region Initialize models
// get the JSON file from the passed URL
function getJSONFile(url,descr) {
    try {
        if ((typeof(url) !== "string") || (typeof(descr) !== "string"))
            throw "getJSONFile: parameter not a string";
        else {
            var httpReq = new XMLHttpRequest(); // a new http request
            httpReq.open("GET",url,false); // init the request
            httpReq.send(null); // send the request
            var startTime = Date.now();
            while ((httpReq.status !== 200) && (httpReq.readyState !== XMLHttpRequest.DONE)) {
                if ((Date.now()-startTime) > 3000)
                    break;
            } // until its loaded or we time out after three seconds
            if ((httpReq.status !== 200) || (httpReq.readyState !== XMLHttpRequest.DONE))
                throw "Unable to open "+descr+" file!";
            else
                return JSON.parse(httpReq.response);
        } // end if good params
    } // end try

    catch(e) {
        console.log(e);
        return(String.null);
    }
} // end get json file

function bufferTriangleSet(triangleSet) {
    // send the vertex coords to webGL
    triangleSet.vertexBuffer = gl.createBuffer(); // init empty vertex coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, triangleSet.vertexBuffer); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triangleSet.coordArray), gl.STATIC_DRAW); // coords to that buffer

    // send the vertex normals to webGL
    triangleSet.normalBuffer = gl.createBuffer(); // init empty vertex coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, triangleSet.normalBuffer); // activate that buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triangleSet.normalArray), gl.STATIC_DRAW); // normals to that buffer

    // send the triangle indices to webGL
    triangleSet.triangleBuffer = gl.createBuffer(); // init empty triangle index buffer
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleSet.triangleBuffer); // activate that buffer
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangleSet.indexArray), gl.STATIC_DRAW); // indices to that buffer
}

function initCamera(eye, lookAt, viewUp) {
    camera.xyz = vec3.fromValues(eye[0], eye[1], eye[2]);
    camera.pMatrix = calcPerspective(camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far);

    let center = vec3.fromValues(eye[0] + lookAt[0], eye[1] + lookAt[1], eye[2] + lookAt[2]);
    camera.vMatrix = mat4.lookAt(mat4.create(), eye, center, viewUp);
    updateCameraAxis();
}

// read triangles in, load them into webgl buffers
// @deprecated
function loadTriangles() {
    var inputTriangles = getJSONFile(INPUT_TRIANGLES_URL,"triangles");
    // inputTriangles = JSON.parse("[\n" +
    //     "  {\n" +
    //     "    \"material\": {\"ambient\": [0.1,0.1,0.1], \"diffuse\": [0.6,0.4,0.4], \"specular\": [0.3,0.3,0.3], \"n\":11}, \n" +
    //     "    \"vertices\": [[0.5, 2.0, 1.0],[2.0, 0.5, 1.0],[-1.0,-1.0, 1.0]],\n" +
    //     "    \"normals\": [[0, 0, -1],[0, 0, -1],[0, 0, -1]],\n" +
    //     "    \"triangles\": [[0,1,2]]\n" +
    //     "  },\n" +
    //     "  {\n" +
    //     "    \"material\": {\"ambient\": [0.1,0.1,0.1], \"diffuse\": [0.6,0.6,0.4], \"specular\": [0.3,0.3,0.3], \"n\":17}, \n" +
    //     "    \"vertices\": [[0.15, 0.15, 0.75],[0.15, 0.35, 0.75],[0.35,0.35,0.75],[0.35,0.15,0.75]],\n" +
    //     "    \"normals\": [[0, 0, -1],[0, 0, -1],[0, 0, -1],[0, 0, -1]],\n" +
    //     "    \"triangles\": [[0,1,2],[2,3,0]]\n" +
    //     "  }\n" +
    //     "]");

    if (inputTriangles != String.null) { 
        var whichSetVert; // index of vertex in current triangle set
        var whichSetTri; // index of triangle in current triangle set
        var coordArray = []; // 1D array of vertex coords for WebGL
        var indexArray = []; // 1D array of vertex indices for WebGL
        var vtxBufferSize = 0; // the number of vertices in the vertex buffer
        var vtxToAdd = []; // vtx coords to add to the coord array
        var indexOffset = vec3.create(); // the index offset for the current set
        var triToAdd = vec3.create(); // tri indices to add to the index array
        
        for (var whichSet=0; whichSet<inputTriangles.length; whichSet++) {
            vec3.set(indexOffset,vtxBufferSize,vtxBufferSize,vtxBufferSize); // update vertex offset
            
            // set up the vertex coord array
            for (whichSetVert=0; whichSetVert<inputTriangles[whichSet].vertices.length; whichSetVert++) {
                vtxToAdd = inputTriangles[whichSet].vertices[whichSetVert];
                coordArray.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]);
            } // end for vertices in set
            
            // set up the triangle index array, adjusting indices across sets
            for (whichSetTri=0; whichSetTri<inputTriangles[whichSet].triangles.length; whichSetTri++) {
                vec3.add(triToAdd,indexOffset,inputTriangles[whichSet].triangles[whichSetTri]);
                indexArray.push(triToAdd[0],triToAdd[1],triToAdd[2]);
            } // end for triangles in set

            vtxBufferSize += inputTriangles[whichSet].vertices.length; // total number of vertices
            triBufferSize += inputTriangles[whichSet].triangles.length; // total number of tris
        } // end for each triangle set 
        triBufferSize *= 3; // now total number of indices

        // console.log("coordinates: "+coordArray.toString());
        // console.log("numverts: "+vtxBufferSize);
        // console.log("indices: "+indexArray.toString());
        // console.log("numindices: "+triBufferSize);
        
        // send the vertex coords to webGL
        vertexBuffer = gl.createBuffer(); // init empty vertex coord buffer
        gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); // activate that buffer
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(coordArray),gl.STATIC_DRAW); // coords to that buffer
        
        // send the triangle indices to webGL
        triangleBuffer = gl.createBuffer(); // init empty triangle index buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer); // activate that buffer
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indexArray),gl.STATIC_DRAW); // indices to that buffer

    } // end if triangles found
} // end load triangles

// Read triangle sets in
function loadTriangleSets() {
    var inputTriangles = getJSONFile(INPUT_TRIANGLES_URL,"triangles");
    triangleSets.array = [];
    triangleSets.selectId = 0;

    if (inputTriangles != String.null) {
        var whichSetTri; // index of triangle in current triangle set
        var vtxToAdd = []; // vtx coords to add to the coord array

        for (var whichSet=0; whichSet<inputTriangles.length; whichSet++) {
            var curSet = inputTriangles[whichSet];
            var triangleSet = {};
            triangleSet.doubleSide = true;
            triangleSet.triBufferSize = 0;
            triangleSet.specularModel = 1;
            triangleSet.material = curSet.material;
            triangleSet.coordArray = []; // 1D array of vertex coords for WebGL
            triangleSet.normalArray = []; // 1D array of vertex normals for WebGL
            triangleSet.indexArray = []; // 1D array of vertex indices for WebGL

            // Calculate triangles center
            var triCenter = vec3.create();
            for(let i = 0; i < curSet.vertices.length; i++) {
                vec3.add(triCenter, triCenter, curSet.vertices[i]);
            }
            vec3.scale(triCenter, triCenter, 1.0/curSet.vertices.length);

            // Add coordinates to buffer
            for(let i = 0; i < curSet.vertices.length; i++) {
                vtxToAdd = vec3.subtract(vec3.create(), curSet.vertices[i], triCenter);
                triangleSet.coordArray.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]);
            }

            // Add normals to buffer
            for(let i = 0; i < curSet.normals.length; i++) {
                triangleSet.normalArray.push(curSet.normals[i][0],curSet.normals[i][1],curSet.normals[i][2]);
            }

            // Add triangles to buffer
            for (whichSetTri=0; whichSetTri<curSet.triangles.length; whichSetTri++) {
                for (let i = 0; i < 3; i++, triangleSet.triBufferSize++) {
                    triangleSet.indexArray.push(curSet.triangles[whichSetTri][i]);
                }
            } // end for triangles in set

            // Buffer data arrays into GPU
            bufferTriangleSet(triangleSet);

            // Initialize model transform matrices
            triangleSet.tMatrix = mat4.fromTranslation(mat4.create(), triCenter);
            triangleSet.rMatrix = mat4.identity(mat4.create());

            // Push triangleset into array
            triangleSet.id = models.array.length;
            models.array.push(triangleSet);
            triangleSets.array.push(triangleSet);
        } // end for each triangle set
    } // end if triangles found
} // end load triangleSets

// Read ellipsoid in
function loadEllipsoids() {
    let nLatitude = 20;
    let nLongitude = 40;
    var inputEllipsoids = getJSONFile(INPUT_SPHERES_URL,"ellipsoids");
    ellipsoids.array = [];
    ellipsoids.selectId = 0;

    if (inputEllipsoids != String.null) {
        for (var whichSet=0; whichSet<inputEllipsoids.length; whichSet++) {
            var curSet = inputEllipsoids[whichSet];
            var triangleSet = {};
            triangleSet.doubleSide = false;
            triangleSet.triBufferSize = 0;
            triangleSet.specularModel = 1;
            triangleSet.material = {};
            triangleSet.material.ambient = curSet.ambient;
            triangleSet.material.diffuse = curSet.diffuse;
            triangleSet.material.specular = curSet.specular;
            triangleSet.material.n = curSet.n;
            triangleSet.coordArray = []; // 1D array of vertex coords for WebGL
            triangleSet.normalArray = []; // 1D array of vertex normals for WebGL
            triangleSet.indexArray = []; // 1D array of vertex indices for WebGL

            // Create triangles center
            var triCenter = vec3.fromValues(curSet.x, curSet.y, curSet.z);

            // Calculate and add vertices coordinates and normals
            let deltaLat = Math.PI / nLatitude;
            let deltaLong = 2 * Math.PI / nLongitude;
            for(let i = 0, theta = 0.0; i <= nLatitude; i++, theta += deltaLat) {
                let sinT = Math.sin(theta), cosT = Math.cos(theta);
                for(let j = 0, phi = 0.0; j <= nLongitude; j++, phi += deltaLong) {
                    let sinP = Math.sin(phi), cosP = Math.cos(phi);
                    let xu = cosP*sinT, yu = cosT, zu = sinP*sinT;
                    triangleSet.coordArray.push(xu * curSet.a, yu * curSet.b, zu * curSet.c);
                    triangleSet.normalArray.push(xu / curSet.a, yu / curSet.b, zu / curSet.c);
                }
            }

            // Calculate and add triangles
            for(let i = 0, up = 0, down = nLongitude + 1; i < nLatitude; i++, up = down, down += nLongitude + 1) {
                for(let left = 0, right = 1; left < nLongitude; left++, right++, triangleSet.triBufferSize += 6) {
                    triangleSet.indexArray.push(up + left, down + left, up + right);
                    triangleSet.indexArray.push(down + left, down + right, up + right);
                }
            }

            // Buffer data arrays into GPU
            bufferTriangleSet(triangleSet);

            // Initialize model transform matrices
            triangleSet.tMatrix = mat4.fromTranslation(mat4.create(), triCenter);
            triangleSet.rMatrix = mat4.identity(mat4.create());

            // Push triangleset into array
            triangleSet.id = models.array.length;
            models.array.push(triangleSet);
            ellipsoids.array.push(triangleSet);
        } // end for each ellipsoid
    } // end if ellipsoids found
} // end load ellipsoids

function loadLights() {
    lightArray = getJSONFile(lightsURL, "lights");
    // lightArray = JSON.parse("[\n" +
    //     "{\"x\": -1.0, \"y\": 3.0, \"z\": -0.5, \"ambient\": [1,1,1], \"diffuse\": [1,1,1], \"specular\": [1,1,1]}\n" +
    //     ",{\"x\": -1.0, \"y\": 3.0, \"z\": -0.5, \"ambient\": [0,0,1], \"diffuse\": [0,0,1], \"specular\": [0,0,1]}\n" +
    //     ",{\"x\": 2, \"y\": -1, \"z\": -0.5, \"ambient\": [0,1,0], \"diffuse\": [0,1,0], \"specular\": [0,1,0]}\n" +
    //     "]");
}
//endregion

//region Manipulate models
function getLightUniformLocation(program, varName) {
    var lightUniform = {};
    lightUniform.xyz = gl.getUniformLocation(program, varName + ".xyz");
    lightUniform.ambient = gl.getUniformLocation(program, varName + ".ambient");
    lightUniform.diffuse = gl.getUniformLocation(program, varName + ".diffuse");
    lightUniform.specular = gl.getUniformLocation(program, varName + ".specular");
    return lightUniform;
}

function getMaterialUniformLocation(program, varName) {
    var lightUniform = {};
    lightUniform.ambient = gl.getUniformLocation(program, varName + ".ambient");
    lightUniform.diffuse = gl.getUniformLocation(program, varName + ".diffuse");
    lightUniform.specular = gl.getUniformLocation(program, varName + ".specular");
    lightUniform.n = gl.getUniformLocation(program, varName + ".n");
    return lightUniform;
}

function setLightUniform(lightUniform, light) {
    gl.uniform3f(lightUniform.xyz, light.x, light.y, light.z);
    gl.uniform3fv(lightUniform.ambient, light.ambient);
    gl.uniform3fv(lightUniform.diffuse, light.diffuse);
    gl.uniform3fv(lightUniform.specular, light.specular);
}

function setMaterialUniform(materialUniform, material) {
    gl.uniform3fv(materialUniform.ambient, material.ambient);
    gl.uniform3fv(materialUniform.diffuse, material.diffuse);
    gl.uniform3fv(materialUniform.specular, material.specular);
    gl.uniform1f(materialUniform.n, material.n);
}

function calcPerspective(left, right, top, bottom, near, far) {
    let n = Math.abs(near), f = Math.abs(far);
    let width = right - left, height = top - bottom, deep = f - n;
    var pMatrix = mat4.create();
    pMatrix[0] = 2*n/width;
    pMatrix[1] = 0;
    pMatrix[2] = 0;
    pMatrix[3] = 0;
    pMatrix[4] = 0;
    pMatrix[5] = 2*n/height;
    pMatrix[6] = 0;
    pMatrix[7] = 0;
    pMatrix[8] = (right + left)/width;
    pMatrix[9] = (top + bottom)/height;
    pMatrix[10] = -(f+n)/deep;
    pMatrix[11] = -1;
    pMatrix[12] = 0;
    pMatrix[13] = 0;
    pMatrix[14] = -2*f*n/deep;
    pMatrix[15] = 0;
    return pMatrix;
}

function updateCameraAxis() {
    camera.X = vec3.fromValues(camera.vMatrix[0], camera.vMatrix[4], camera.vMatrix[8]);
    camera.Y = vec3.fromValues(camera.vMatrix[1], camera.vMatrix[5], camera.vMatrix[9]);
    camera.Z = vec3.fromValues(camera.vMatrix[2], camera.vMatrix[6], camera.vMatrix[10]);
}

function rotateCamera(rad, axis) {
    mat4.multiply(camera.vMatrix, mat4.fromRotation(mat4.create(), -rad, axis), camera.vMatrix);
    updateCameraAxis();
}

function translateCamera(vec) {
    for(let i = 0; i < 3; i++) {
        camera.vMatrix[i + 12] -= vec[i];
        camera.xyz[i] += camera.X[i] * vec[0] + camera.Y[i] * vec[1] + camera.Z[i] * vec[2];
    }
}
//endregions

// render the loaded model
function renderTriangles() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers

    gl.uniform3fv(uniforms.cameraPosUniform, camera.xyz);
    gl.uniformMatrix4fv(uniforms.vMatrixUniform, false, camera.vMatrix);
    gl.uniformMatrix4fv(uniforms.pMatrixUniform, false, camera.pMatrix);
    for (let i = 0; i < lightArray.length; i++) {
        setLightUniform(uniforms.lightUniformArray[i], lightArray[i]);
    }

    // Test rMatrix
    // ellipsoids.array[0].doubleSide = true;
    // triangleSets.array[0].doubleSide = false;
    // mat4.fromRotation(triangleSetArray[1].rMatrix, Math.PI/4, [0,1,0]);
    // let scaleTest = 3;
    // mat4.scale(triangleSetArray[1].rMatrix, triangleSetArray[1].rMatrix, [scaleTest, scaleTest, scaleTest]);
    var scaleMatrix = mat4.identity(mat4.create());
    mat4.scale(scaleMatrix, scaleMatrix, [1.2, 1.2, 1.2]);

    for(let i = 0; i < models.array.length; i++) {
        if(useLight)
            gl.uniform1i(uniforms.lightModelUniform, models.array[i].specularModel);
        else
            gl.uniform1i(uniforms.lightModelUniform, -1);
        // triangleSetArray[i].material.ambient = [0.5,1.0,1.0];
        gl.uniform1f(uniforms.doubleSideUniform, models.array[i].doubleSide);
        setMaterialUniform(uniforms.materialUniform, models.array[i].material);
        var mMatrix = mat4.multiply(mat4.create(), models.array[i].tMatrix, models.array[i].rMatrix);
        if (models.selectId === i) {
            mMatrix = mat4.multiply(mat4.create(), mMatrix, scaleMatrix);
        }
        gl.uniformMatrix4fv(uniforms.mMatrixUniform, false, mMatrix);
        gl.uniformMatrix3fv(uniforms.nMatrixUniform, false, mat3.normalFromMat4(mat3.create(), models.array[i].rMatrix));

        // vertex buffer: activate and feed into vertex shader
        gl.bindBuffer(gl.ARRAY_BUFFER, models.array[i].vertexBuffer); // activate
        gl.vertexAttribPointer(vertexPositionAttrib,3,gl.FLOAT,false,0,0); // feed

        // vertex normal buffer: activate and feed into vertex shader
        gl.bindBuffer(gl.ARRAY_BUFFER, models.array[i].normalBuffer); // activate
        gl.vertexAttribPointer(vertexNormalAttrib,3,gl.FLOAT,false,0,0); // feed

        // triangle buffer: activate and render
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, models.array[i].triangleBuffer); // activate
        gl.drawElements(gl.TRIANGLES, models.array[i].triBufferSize,gl.UNSIGNED_SHORT,0); // render
    }
} // end render triangles

function refresh() {
    loadDocumentInputs();
    loadLights(); // load in the lights
    setupWebGL(); // set up the webGL environment
    camera.pMatrix = calcPerspective(camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far);
    setupShaders(); // setup the webGL shaders
    renderTriangles();
}

/* MAIN -- HERE is where execution begins after window load */

function main() {

    loadDocumentInputs();   // load the data from html page
    loadLights(); // load in the lights
    setupWebGL(); // set up the webGL environment
    initCamera(Eye, LookAt, ViewUp); // Initialize camera
    loadTriangleSets(); // load in the triangles from tri file
    loadEllipsoids(); // load in the ellipsoids from ellipsoids file
    setupShaders(); // setup the webGL shaders
    renderTriangles(); // draw the triangles using webGL
    setupKeyEvent();
  
} // end main
