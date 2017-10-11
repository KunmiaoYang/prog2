/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const WIN_Z = 0;  // default graphics window z coord in world space
const WIN_LEFT = 0; const WIN_RIGHT = 1;  // default left and right x coords in world space
const WIN_BOTTOM = 0; const WIN_TOP = 1;  // default top and bottom y coords in world space
const INPUT_TRIANGLES_URL = "https://ncsucgclass.github.io/prog2/triangles.json"; // triangles file loc
const INPUT_SPHERES_URL = "https://ncsucgclass.github.io/prog2/ellipsoids.json"; // ellipsoids file loc
var Eye = new vec4.fromValues(0.5,0.5,-0.5,1.0); // default eye position in world space

/* webgl globals */
var gl = null; // the all powerful gl object. It's all here folks!
var shaderProgram;
var vertexBuffer; // this contains vertex coordinates in triples
var triangleBuffer; // this contains indices into vertexBuffer in triples
var triBufferSize = 0; // the number of indices in the triangle buffer
var vertexPositionAttrib; // where to put position for vertex shader

var vertexNormalAttrib;

var triangleSetArray = [];
var lightArray = [];

var uniforms = {};

// ASSIGNMENT HELPER FUNCTIONS

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

// set up the webGL environment
function setupWebGL() {

    // Get the canvas and context
    var canvas = document.getElementById("myWebGLCanvas"); // create a js canvas
    gl = canvas.getContext("webgl"); // get a webgl object from it
    gl.viewportWidth = canvas.width; // store width
    gl.viewportHeight = canvas.height; // store height
    
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

// read triangles in, load them into webgl buffers
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

function loadTriangleSets() {
    var inputTriangles = getJSONFile(INPUT_TRIANGLES_URL,"triangles");

    if (inputTriangles != String.null) {
        var whichSetTri; // index of triangle in current triangle set
        var vtxToAdd = []; // vtx coords to add to the coord array

        for (var whichSet=0; whichSet<inputTriangles.length; whichSet++) {
            var curSet = inputTriangles[whichSet];
            var triangleSet = {};
            triangleSet.triBufferSize = 0;
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
                for (let i = 0; i < 3; i++) {
                    triangleSet.indexArray.push(curSet.triangles[whichSetTri][i]);
                    triangleSet.triBufferSize++;
                }
            } // end for triangles in set

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

            // Push triangleset into triangleSetArray
            triangleSet.tMatrix = mat4.fromTranslation(mat4.create(), triCenter);
            triangleSet.rMatrix = mat4.identity(mat4.create());
            triangleSetArray.push(triangleSet);
        } // end for each triangle set
    } // end if triangles found
} // end load triangles

function loadLights() {
    lightArray = JSON.parse("[\n" +
        "{\"x\": -1.0, \"y\": 3.0, \"z\": -0.5, \"ambient\": [1,1,1], \"diffuse\": [1,1,1], \"specular\": [1,1,1]}\n" +
        "]");
}

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

// setup the webGL shaders
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
        
        uniform light_struct uLights[1];
        uniform material_struct uMaterial;
        
        varying vec3 vTransformedNormal;
        varying vec4 vPosition;

        void main(void) {
            vec3 rgb = vec3(0, 0, 0);
            vec3 L = normalize(uLights[0].xyz - vPosition.xyz);
            vec3 N = normalize(vTransformedNormal);
            float dLN = dot(L, N);
            rgb += uMaterial.ambient * uLights[0].ambient;
            if(dLN > 0.0) {
                rgb += dLN * (uMaterial.diffuse * uLights[0].diffuse);
            }
            gl_FragColor = vec4(rgb, 1.0); // all fragments are white
        }
    `;
    
    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 vertexPosition;
        attribute vec3 vertexNormal;

        uniform mat4 uMMatrix;      // Model transformation
        uniform mat4 uVMatrix;      // Viewing transformation
        uniform mat4 uPMatrix;      // Projection transformation
        uniform mat3 uNMatrix;      // Normal vector transformation
        
        varying vec3 vTransformedNormal;
        varying vec4 vPosition;

        void main(void) {
            vPosition = uMMatrix * vec4(vertexPosition, 1.0);
            gl_Position = uPMatrix * uVMatrix * vPosition;
            vTransformedNormal = uNMatrix * vertexNormal;
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
                uniforms.mMatrixUniform = gl.getUniformLocation(shaderProgram, "uMMatrix");
                uniforms.vMatrixUniform = gl.getUniformLocation(shaderProgram, "uVMatrix");
                uniforms.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
                uniforms.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
                uniforms.materialUniform = getMaterialUniformLocation(shaderProgram, "uMaterial")
                uniforms.lightUniformArray = [getLightUniformLocation(shaderProgram, "uLights[0]")];
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders

// render the loaded model
function renderTriangles() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers

    var rot = mat4.fromRotation(mat4.create(), Math.PI, [0, 1, 0]);
    var trans = mat4.fromTranslation(mat4.create(), [-0.5, -0.5, 0.5]);
    var vMatrix = mat4.multiply(mat4.create(), rot, trans);
    var pMatrix = mat4.perspective(mat4.identity(mat4.create()), Math.PI/2, gl.viewportWidth / gl.viewportHeight, 0.5, 1.5);
    gl.uniformMatrix4fv(uniforms.vMatrixUniform, false, vMatrix);
    gl.uniformMatrix4fv(uniforms.pMatrixUniform, false, pMatrix);
    setLightUniform(uniforms.lightUniformArray[0], lightArray[0]);

    // Test rMatrix
    // mat4.fromRotation(triangleSetArray[1].rMatrix, Math.PI/4, [0,1,0]);
    // let scaleTest = 3;
    // mat4.scale(triangleSetArray[1].rMatrix, triangleSetArray[1].rMatrix, [scaleTest, scaleTest, scaleTest]);

    for(let i = 0; i < triangleSetArray.length; i++) {
        // triangleSetArray[i].material.ambient = [0.5,1.0,1.0];
        setMaterialUniform(uniforms.materialUniform, triangleSetArray[i].material);
        gl.uniformMatrix4fv(uniforms.mMatrixUniform, false, mat4.multiply(mat4.create(), triangleSetArray[i].tMatrix, triangleSetArray[i].rMatrix));
        gl.uniformMatrix3fv(uniforms.nMatrixUniform, false, mat3.fromMat4(mat3.create(), triangleSetArray[i].rMatrix));

        // vertex buffer: activate and feed into vertex shader
        gl.bindBuffer(gl.ARRAY_BUFFER, triangleSetArray[i].vertexBuffer); // activate
        gl.vertexAttribPointer(vertexPositionAttrib,3,gl.FLOAT,false,0,0); // feed

        // vertex normal buffer: activate and feed into vertex shader
        gl.bindBuffer(gl.ARRAY_BUFFER, triangleSetArray[i].normalBuffer); // activate
        gl.vertexAttribPointer(vertexNormalAttrib,3,gl.FLOAT,false,0,0); // feed

        // triangle buffer: activate and render
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleSetArray[i].triangleBuffer); // activate
        gl.drawElements(gl.TRIANGLES, triangleSetArray[i].triBufferSize,gl.UNSIGNED_SHORT,0); // render
    }
} // end render triangles


/* MAIN -- HERE is where execution begins after window load */

function main() {

    loadLights(); // load in the lights
    setupWebGL(); // set up the webGL environment
    loadTriangleSets(); // load in the triangles from tri file
    setupShaders(); // setup the webGL shaders
    renderTriangles(); // draw the triangles using webGL
  
} // end main
