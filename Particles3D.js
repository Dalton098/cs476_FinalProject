/**
 * Build a class on top of the scene canvas that animates
 * world objects by changing their transformation matrix
 */

vec3 = glMatrix.vec3;
vec4 = glMatrix.vec4;
mat4 = glMatrix.mat4;
quat = glMatrix.quat;

const KEY_W = 87;
const KEY_S = 83;
const KEY_A = 65;
const KEY_D = 68;

var isShot1 = false;
var isShot2 = false;

/**
 * Update the glMatrix transform field of a shape based on 
 * bullet's internal transformation state
 * 
 * @param {object} shape An object containing the fields "ptransform" and "scale"
 */
function updateTransformation(shape) {
    //Scale, rotate, and translate the shape appropriately (in that order)
    let trans = shape.ptransform;
    let x = trans.getOrigin().x();
    let y = trans.getOrigin().y();
    let z = trans.getOrigin().z();
    shape.pos = [x, y, z];
    let q = trans.getRotation();
    // Translation matrix
    let TR = mat4.create();
    mat4.translate(TR, TR, [x, y, z]);
    // Rotation matrix
    let quatMat = mat4.create();
    mat4.fromQuat(quatMat, [q.x(), q.y(), q.z(), q.w()]);
    mat4.multiply(TR, TR, quatMat);
    // Scale matrix
    let SMat = mat4.create();
    mat4.identity(SMat);
    mat4.scale(SMat, SMat, shape.scale);
    mat4.multiply(TR, TR, SMat);
    shape.transform = TR;
}

function Particles() {
    // Step 1: Initialize scene for rendering
    this.scene = {
        "children": [],
        "cameras": [
            {
                "pos": [0.00, 1.50, 5.00],
                "rot": [0.00, 0.00, 0.00, 1.00],
                "fovy": 1.0
            }],
        "lights": [],
        "materials": {
            "redambient": {
                "ka": [0.7, 0.0, 0.0],
                "kd": [1, 1, 1]
            },
            "blueambient": {
                "ka": [0.0, 0.0, 0.7],
                "kd": [1, 1, 1]
            },
            "green": {
                "ka": [0.0, 0.7, 0.0],
                "kd": [1, 1, 1]
            },
            "white": {
                "ka": [1, 1, 1],
                "kd": [1, 1, 1]
            },
            "ground": {
                "ka": [0.2, 0.2, 0.2]
            }
        }
    };

    this.glcanvas = null;
    this.setglcanvas = function (glcanvas) {
        this.glcanvas = glcanvas;
    }

    // Step 2: Initialize physics engine
    // Collision configuration contains default setup for memory, collisions setup
    let collisionConfig = new Ammo.btDefaultCollisionConfiguration();
    // Use the default collision dispatcher.  For parallel processing you can use
    // a different dispatcher (see Extras/BulletMultiThread)
    let dispatcher = new Ammo.btCollisionDispatcher(collisionConfig);
    // btDbvtBroadphase is a good general purpose broadphase.  You can also try out
    // btAxis3Sweep
    let overlappingPairCache = new Ammo.btDbvtBroadphase();
    // The default constraint solver.  For parallel processing you can use a different
    // solver (see Extras/BulletMultiThreaded)
    let solver = new Ammo.btSequentialImpulseConstraintSolver();
    let dynamicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfig);
    dynamicsWorld.setGravity(new Ammo.btVector3(0, 0, 0));
    this.dynamicsWorld = dynamicsWorld;

    /**
     * Add a box to the scene by both creating an entry in the scene graph
     * and initializing information for the physics engine
     * 
     * @param {vec3} pos Initial position of the center of the box 
     * @param {vec3} scale Dimensions of the box along each axis
     * @param {vec3} velocity Initial velocity of the box
     * @param {float} mass Mass of the box.  If it is set to 0, it is assumed
     *                     that the box is static and has infinite inertia
     * @param {float} restitution Coefficient of restitution (between 0 and 1)
     * @param {string} material Material to use
     * @param {quat4} rotation The initial rotation
     * @param {boolean} isHidden If true, only add the object to the physics engine, 
     *                          not to the scene graph
     * 
     * @returns{object} The created box object
     */
    this.addBox = function (pos, scale, velocity, mass, restitution, material, rotation, isHidden) {
        if (material === undefined) {
            material = "default";
        }
        if (rotation === undefined) {
            rotation = [0, 0, 0, 1];
        }
        if (isHidden === undefined) {
            isHidden = false;
        }
        // Step 1: Setup scene graph entry for rendering
        let box = {
            "scale": scale,
            "pos": pos,
            "velocity": velocity,
            "mass": mass,
            "shapes": [
                {
                    "type": "box",
                    "material": material,
                    "hidden": isHidden
                }
            ]
        }
        this.scene.children.push(box);

        const boxShape = new Ammo.btBoxShape(new Ammo.btVector3(scale[0] / 2, scale[1] / 2, scale[2] / 2));
        const ptransform = new Ammo.btTransform();
        ptransform.setIdentity();
        ptransform.setOrigin(new Ammo.btVector3(pos[0], pos[1], pos[2]));
        ptransform.setRotation(rotation[0], rotation[1], rotation[2], rotation[3]);
        box.ptransform = ptransform;
        updateTransformation(box);
        const isDynamic = (mass != 0);
        let localInertia = null;
        if (isDynamic) {
            localInertia = new Ammo.btVector3(velocity[0], velocity[1], velocity[2]);
            boxShape.calculateLocalInertia(mass, localInertia);
        }
        else {
            localInertia = new Ammo.btVector3(0, 0, 0);
        }
        let motionState = new Ammo.btDefaultMotionState(ptransform);
        let rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, boxShape, localInertia);
        // The final rigid body object
        box.body = new Ammo.btRigidBody(rbInfo);
        box.body.setRestitution(restitution);
        // Finally, add the rigid body to the simulator
        this.dynamicsWorld.addRigidBody(box.body);
        return box;
    }

    /**
     * Add a sphere to the scene by both creating an entry in the scene graph
     * and initializing information for the physics engine
     * 
     * @param {vec3} pos Initial position of the center of the sphere 
     * @param {float} radius Radius of the sphere
     * @param {vec3} velocity Initial velocity of the sphere
     * @param {float} mass Mass of the sphere
     * @param {float} restitution Coefficient of restitution (between 0 and 1)
     * @param {string} material Material to use
     * @param {boolean} isLight Should it also be emitting light?
     * @param {boolean} isHidden If true, only add the object to the physics engine, 
     *                          not to the scene graph
     * 
     * @returns {object} The created sphere object
     */
    this.addSphere = function (pos, radius, velocity, mass, restitution, material, isLight, isHidden) {
        if (material === undefined) {
            material = "default";
        }
        if (isLight === undefined) {
            isLight = false;
        }
        if (isHidden === undefined) {
            isHidden = false;
        }

        // Step 1: Setup scene graph entry for rendering
        let sphere = {
            "scale": [radius, radius, radius],
            "pos": pos,
            "radius": radius,
            "velocity": velocity,
            "mass": mass,
            "shapes": [
                {
                    "type": "sphere",
                    "material": material,
                    "hidden": isHidden
                }
            ]
        }
        this.scene.children.push(sphere);
        if (isLight) {
            // If it is a light, need to also add it to the list of lights
            sphere.color = this.scene.materials[material].kd;
            sphere.atten = [1, 0, 0];
            this.scene.lights.push(sphere);
        }

        // Step 2: Setup ammo.js physics engine entry
        const colShape = new Ammo.btSphereShape(radius);
        const localInertia = new Ammo.btVector3(velocity[0], velocity[1], velocity[2]);
        colShape.calculateLocalInertia(mass, localInertia);
        // Need to redefine the transformation for the physics engine
        const ptransform = new Ammo.btTransform();
        ptransform.setIdentity();
        ptransform.setOrigin(new Ammo.btVector3(pos[0], pos[1], pos[2]));
        sphere.ptransform = ptransform;
        updateTransformation(sphere);
        const motionState = new Ammo.btDefaultMotionState(ptransform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, colShape, localInertia);
        // The final rigid body object
        sphere.body = new Ammo.btRigidBody(rbInfo);
        sphere.body.setRestitution(restitution);
        // Finally, add the rigid body to the simulator
        this.dynamicsWorld.addRigidBody(sphere.body);
        return sphere;
    }

    /**
     * Add spheres with a random initial position, radius, initial velocity, mass,
     * and coefficient of restitution
     */
    this.randomlyInitSpheres = function (N) {
        for (let i = 0; i < N; i++) {
            let pos = [Math.random() * 10 - 5, Math.random() * 10, Math.random() * 10 - 5];
            let radius = 0.5 * Math.random();
            let velocity = [Math.random() * 0.1, Math.random() * 0.1, Math.random() * 0.1];
            const mass = Math.random();
            const restitution = Math.random(); // How bouncy the sphere is (between 0 and 1)
            if (i < 4) {
                this.addSphere(pos, radius, velocity, mass, restitution, "white", true);
            }
            else {
                this.addSphere(pos, radius, velocity, mass, restitution, "redambient");
            }
        }
    }

    /**
     * Add a mesh to the scene with a random mass, velocity, position
     * 
     * @param {string} filename Path to mesh
     * @param {vec3} pos Initial position of the center of the sphere 
     * @param {vec3} velocity Initial velocity of the sphere
     * @param {float} mass Mass of the sphere
     * @param {float} restitution Coefficient of restitution (between 0 and 1)
     * @param {string} material Material to use
     * @param {boolean} isLight Should it also be emitting light?
     */
    this.addMesh = function(filename, pos, velocity, mass, restitution, material, rotation, isLight, isHidden) {
        if (isLight === undefined) {
            isLight = false;
        }
        if (rotation === undefined) {
            rotation = [0, 0, 0, 1];
        }
        if (isHidden === undefined) {
            isHidden = false;
        }

        /*
        mesh = new BasicMesh();
        const ptransform = new Ammo.btTransform();
        ptransform.setIdentity();
        ptransform.setOrigin(new Ammo.btVector3(pos[0], pos[1], pos[2]));	
        ptransform.setRotation(rotation[0], rotation[1], rotation[2], rotation[3]);
        mesh.ptransform = ptransform; 
        updateTransformation(mesh);
        */

        // Step 1: Setup the convex hull collision shape
        // for the mesh
        
        let lines = BlockLoader.loadTxt(filename);
        let res = loadFileFromLines(lines.split("\n"));
        let vertices = res.vertices;
        let faces = res.faces;
        let btMesh = new Ammo.btTriangleMesh();
        // Copy vertex information over to bullet
        for (let i = 0; i < vertices.length; i++) {
            let v = vertices[i];
            vertices[i] = new Ammo.btVector3(v[0], v[1], v[2]);
        }
        // Copy over face information (assuming triangle mesh)
        for (let i = 0; i < faces.length; i++) {
            let f = faces[i];
            btMesh.addTriangle(vertices[f[0]], vertices[f[1]], vertices[f[2]]);
        }
        let colShape = new Ammo.btConvexTriangleMeshShape(btMesh);
        /*let hull = new Ammo.btShapeHull(colShape);
        let margin = colShape.getMargin();
        hull.buildHull(margin);
        colShape.setUserPointer(hull);*/

        // Step 2: Initialize the scene graph entry
        let shape = {
            "scale": [1, 1, 1],
            "pos": pos,
            "velocity": velocity,
            "mass": mass,
            "shapes": [
                {
                    "type": "mesh",
                    "filename": filename,
                    "material": material,
                    "hidden": isHidden
                }
            ]
        };
        this.scene.children.push(shape);
        if (isLight) {
            // If it is a light, need to also add it to the list of lights
            shape.color = this.scene.materials[material].kd;
            shape.atten = [1, 0, 0];
            this.scene.lights.push(shape);
        }

        // Step 3: Setup ammo.js physics engine entry
        const localInertia = new Ammo.btVector3(velocity[0], velocity[1], velocity[2]);
        colShape.calculateLocalInertia(mass, localInertia);
        // Need to redefine the transformation for the physics engine
        const ptransform = new Ammo.btTransform();
        ptransform.setIdentity();
        ptransform.setOrigin(new Ammo.btVector3(pos[0], pos[1], pos[2]));
        ptransform.setRotation(new Ammo.btQuaternion(rotation[0], rotation[1], rotation[2], rotation[3]));
        shape.ptransform = ptransform;
        updateTransformation(shape);
        const motionState = new Ammo.btDefaultMotionState(ptransform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, colShape, localInertia);
        // The final rigid body object
        shape.body = new Ammo.btRigidBody(rbInfo);
        shape.body.setRestitution(restitution);
        // Finally, add the rigid body to the simulator
        this.dynamicsWorld.addRigidBody(shape.body);

        return shape;
    }

    /**
     * Add boxes with a random initial position, dimensions, initial velocity, mass,
     * coefficient of restitution, and orientation
     */
    this.randomlyInitBoxes = function (N) {
        for (let i = 0; i < N; i++) {
            let pos = [Math.random() * 10 - 5, Math.random() * 10, Math.random() * 10 - 5];
            let scale = [0.5 * Math.random(), 0.5 * Math.random(), 0.5 * Math.random()];
            let velocity = [Math.random() * 0.1, Math.random() * 0.1, Math.random() * 0.1];
            const mass = Math.random();
            const restitution = Math.random();
            let rotation = vec4.create();
            vec4.random(rotation, 1);
            this.addBox(pos, scale, velocity, mass, restitution, "blueambient", rotation);
        }
    }

    this.addCameraSphere = function () {
        let pos = [Math.random() * 10 - 5, Math.random() * 10, Math.random() * 10 - 5];
        let radius = 0.5 * Math.random();
        let velocity = [Math.random() * 0.1, Math.random() * 0.1, Math.random() * 0.1];
        const mass = Math.random();
        const restitution = Math.random(); // How bouncy the sphere is (between 0 and 1)
        this.camerasphere = this.addSphere(pos, radius, velocity, mass, restitution, "white");
    }

    this.time = 0.0;
    this.lastTime = (new Date()).getTime();

    /**
     * A helper function to extract vectors from the camera
     */
    this.getCameraVectors = function () {
        let T = vec3.create();
        let R = vec3.create();
        vec3.copy(R, this.glcanvas.camera.right);
        let U = vec3.create();
        vec3.copy(U, this.glcanvas.camera.up);
        vec3.cross(T, U, R);
        return { 'T': T, 'U': U, 'R': R };
    }

    /**
     * Step forward in time in the physics simulation.
     * Then, for each rigid body object in the scene, read out
     * the current position and orientation from the physics
     * engine, and send it over to the rendering engine (ggslac)
     * via a transformation matrix
     */
    this.animate = function (timeDiff) {

        this.winCon = false

        if(particles.groudon.body.getLinearVelocity().x() != 0 || particles.groudon.body.getLinearVelocity().y()
        || particles.groudon.body.getLinearVelocity().z()){
            this.winCon = true
        }


        // shooting from groudon
        if (timeDiff % 2 === 0 && timeDiff != 0) {

            if (!isShot1) {

                let pos = vec3.create();
                let res = this.getCameraVectors();
                let T = res['T'];
                let U = res['U'];
                vec3.scaleAndAdd(pos, this.glcanvas.camera.pos, U, 0);
                vec3.scaleAndAdd(pos, pos, T, 2);

                pos = [0, 6, -10];
                let sphere = this.addSphere(pos, 0.6, [0, 0, 0], 0.1, 0.1, "blueambient");

                var plusOrMinus = Math.random() < 0.5 ? -1 : 1;
                var plusOrMinus2 = Math.random() < 0.5 ? -1 : 1;
                Ran = [Math.random() * plusOrMinus, Math.random() * plusOrMinus2, -1];
                vec3.scale(Ran, Ran, -4);

                sphere.body.setLinearVelocity(new Ammo.btVector3(Ran[0], Ran[1], Ran[2]));
                this.glcanvas.parseNode(sphere);

                isShot1 = true;
            }

        } else {
            isShot1 = false;
        }



        let thisTime = (new Date()).getTime();
        let dt = (thisTime - this.lastTime) / 1000.0; // Change in time in seconds
        this.time += dt;
        this.lastTime = thisTime;
        this.dynamicsWorld.stepSimulation(dt, 10);
        for (shape of this.scene.children) {
            let trans = shape.ptransform;
            shape.body.getMotionState().getWorldTransform(trans);
            updateTransformation(shape);
        }
        if (!(this.glcanvas === null)) {
            // Make the camera in world coordinates 4 units in z in front of the cow
            // and 2 units above the cow
            this.glcanvas.camera.pos = vec3.fromValues(0, 2, 5);

        }

        this.cow.body.setAngularVelocity(new Ammo.btVector3(0, 0, 0))
        if (!(this.keysDown === undefined)) {

            if (this.keysDown[KEY_W]) {
                // Apply a central impulse in the forward direction of the camera
                this.cow.body.getLinearVelocity().setY(4);
                this.cow.body.getLinearVelocity().setX(0);
            }
            if (this.keysDown[KEY_S]) {
                // Apply a central impulse in the reverse direction of the camera
                this.cow.body.getLinearVelocity().setY(-4);
                this.cow.body.getLinearVelocity().setX(0);
            }
            if (this.keysDown[KEY_D]) {
                // Apply a central impulse in the right direction of the camera
                this.cow.body.getLinearVelocity().setX(4);
                this.cow.body.getLinearVelocity().setY(0);
            }
            if (this.keysDown[KEY_A]) {
                // Apply a central impulse in the left direction of the camera
                this.cow.body.getLinearVelocity().setX(-4);
                this.cow.body.getLinearVelocity().setY(0);
            }
            if (this.keysDown[KEY_A] && this.keysDown[KEY_W]) {
                // Apply a central impulse in the left direction of the camera
                this.cow.body.getLinearVelocity().setX(-4);
                this.cow.body.getLinearVelocity().setY(2);
            }
            if (this.keysDown[KEY_A] && this.keysDown[KEY_S]) {
                // Apply a central impulse in the left direction of the camera
                this.cow.body.getLinearVelocity().setX(-4);
                this.cow.body.getLinearVelocity().setY(-4);
            }
            if (this.keysDown[KEY_D] && this.keysDown[KEY_W]) {
                // Apply a central impulse in the left direction of the camera
                this.cow.body.getLinearVelocity().setX(4);
                this.cow.body.getLinearVelocity().setY(4);
            }
            if (this.keysDown[KEY_D] && this.keysDown[KEY_S]) {
                // Apply a central impulse in the left direction of the camera
                this.cow.body.getLinearVelocity().setX(4);
                this.cow.body.getLinearVelocity().setY(-4);
            }

        }

        if (!this.keysDown[KEY_W] && !this.keysDown[KEY_S] && !this.keysDown[KEY_A] && !this.keysDown[KEY_D]) {
            this.cow.body.setLinearVelocity(new Ammo.btVector3(0, 0, 0));
        }


    }

    this.keyDown = function (evt) {
        for (key of [KEY_W, KEY_S, KEY_D, KEY_A]) {
            if (evt.keyCode == key) {
                this.keysDown[key] = true;
            }
        }
    }

    this.keyUp = function (evt) {
        for (key of [KEY_W, KEY_S, KEY_D, KEY_A]) {
            if (evt.keyCode == key) {
                this.keysDown[key] = false;
            }
        }
    }

    this.makeClick = function (evt) {
        let clickType = "LEFT";
        evt.preventDefault();
        if (evt.which) {
            if (evt.which == 3) clickType = "RIGHT";
            if (evt.which == 2) clickType = "MIDDLE";
        }
        else if (evt.button) {
            if (evt.button == 2) clickType = "RIGHT";
            if (evt.button == 4) clickType = "MIDDLE";
        }

    }

    this.setupListeners = function () {
        this.glcanvas.active = false; // Disable default listeners
        this.keysDown = { KEY_W: false, KEY_S: false, KEY_A: false, KEY_D: false };
        document.addEventListener('keydown', this.keyDown.bind(this), true);
        document.addEventListener('keyup', this.keyUp.bind(this), true);
        this.glcanvas.addEventListener('mousedown', this.makeClick.bind(this));
    }
}
