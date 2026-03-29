const API_BASE = '/api';

let currentMap = null;
let currentPath = null;
let roverPos = null;
let simulationInterval = null;
let simStep = 0;
let totalDistance = 0;
let currentYaw = 0; // Rover's heading angle for FPS vision

let is3DMode = false;
let scene, camera, renderer, terrainMesh, pathLines, roverMesh, controls, gridHelper, rockGroup;

const canvas = document.getElementById('lunar-map');
const ctx = canvas.getContext('2d');
const visionCanvas = document.getElementById('vision-canvas');
const visionCtx = visionCanvas.getContext('2d');
const container3D = document.getElementById('threejs-container');

const UI = {
    startBtn: document.getElementById('start-sim-btn'),
    planBtn: document.getElementById('plan-route-btn'),
    genBtn: document.getElementById('generate-map-btn'),
    toggle3DBtn: document.getElementById('toggle-3d-btn'),
    visionLogs: document.getElementById('vision-logs')
};



function logTerminal(msg, type='normal') {
    const div = document.createElement('div');
    const d = new Date();
    const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    div.innerHTML = `<span class="time">[${time}]</span><span class="${type}">${msg}</span>`;
    UI.visionLogs.appendChild(div);
    UI.visionLogs.scrollTop = UI.visionLogs.scrollHeight;
}

// ---------------- 3D WEBGL (THREE.JS) SETUP ----------------
function init3D() {
    if(renderer) return; // already init
    scene = new THREE.Scene();
    
    // Arka plan ve Sis (Fog) efekti
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.FogExp2(0x020617, 0.015);
    
    // Yıldız tarlası (Starfield)
    const starGeo = new THREE.BufferGeometry();
    const starCounts = 1000;
    const starPos = new Float32Array(starCounts * 3);
    for(let i=0; i<starCounts*3; i++) {
        starPos[i] = (Math.random() - 0.5) * 200;
        if(i%3 === 1) starPos[i] = Math.max(10, starPos[i]); // Yıldızlar havada olsun
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({color: 0xffffff, size: 0.2, transparent: true, opacity: 0.8});
    const starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);
    
    // Y ekseni yukarı bakacak şekilde Isometric/Kuşbakışı açısı
    camera = new THREE.PerspectiveCamera(60, container3D.clientWidth / container3D.clientHeight, 0.1, 1000);
    camera.position.set(25, 30, 45);
    camera.lookAt(25, 0, 25);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
    renderer.setSize(container3D.clientWidth, container3D.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Yumuşak Gölgeler
    container3D.appendChild(renderer.domElement);
    
    // Yörünge kontrolleri (Mouse ile hareket)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Yerin altına inmeyi engelle
    
    // Işıklandırma (Gölge destekli)
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(50, 100, 50);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 200;
    light.shadow.camera.left = -50;
    light.shadow.camera.right = 50;
    light.shadow.camera.top = 50;
    light.shadow.camera.bottom = -50;
    light.shadow.bias = -0.001;
    scene.add(light);
    
    // Ortam ışığı
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    hemiLight.position.set(0, 100, 0);
    scene.add(hemiLight);
    
    // Render loop
    function animate() {
        requestAnimationFrame(animate);
        if(is3DMode) {
            if(controls) controls.update(); // Damping ve hareket güncellemeleri
            
            // Yıldızları yavaşça döndür
            starPoints.rotation.y += 0.0002;
            
            renderer.render(scene, camera);
        }
    }
    animate();
}

function update3DMap(resetCamera = false) {
    if(!is3DMode || !currentMap || !scene) return;
    
    // Clear old elements
    if(terrainMesh) scene.remove(terrainMesh);
    if(pathLines) scene.remove(pathLines);
    if(roverMesh) scene.remove(roverMesh);
    if(gridHelper) scene.remove(gridHelper);
    if(rockGroup) scene.remove(rockGroup);
    
    const w = currentMap.width; 
    const h = currentMap.height;
    
    const geometry = new THREE.PlaneGeometry(w, h, w-1, h-1);
    const vertices = geometry.attributes.position.array;
    
    // Z is mapped to Y in world coords eventually because of rotation, but plain PlaneGeom has Z=0
    const colors = [];
    const colorObj = new THREE.Color();

    for(let y=0; y<h; y++) {
        for(let x=0; x<w; x++) {
            const idx = (y * w + x) * 3;
            const cell = currentMap.grid[y][x];
            let rawE = cell.elevation * 6.0;
            vertices[idx+2] = rawE; // Raise elevation
            
            let isHazard = false;
            if(cell.is_obstacle && cell.rock > 0.5) {
                vertices[idx+2] += 0.2 + (Math.random()*0.3); // Eskisi gibi bitişik yolu kesmemesi için dikitleri (spike) kaldırdık
                isHazard = true;
            } else if (cell.crater > 0.4) {
                vertices[idx+2] -= Math.random(); // Krater merkezlerini biraz daha çukurlaştır
            }
            
            // Yüksekliğe veya tehlikeye göre dinamik Vertex Color ataması (Texture yoksa)
            if(!currentMap.texture_b64) {
                if (isHazard) {
                    colorObj.setHex(0x7f1d1d); // Kaya zemin izi (Koyu kırmızı)
                } else if (cell.crater > 0.4) {
                    colorObj.setRGB(0.1, 0.1, 0.1); // Koyu krater
                } else if (cell.slope > 0.6) {
                    colorObj.setHex(0xf97316); // Tehlikeli eğim
                } else {
                    // Ay Grisi / Beyazı gradyanı
                    const tone = 0.3 + (cell.elevation * 0.4);
                    colorObj.setRGB(tone, tone, tone + 0.05); 
                }
                colors.push(colorObj.r, colorObj.g, colorObj.b);
            }
        }
    }
    
    geometry.computeVertexNormals();
    if(!currentMap.texture_b64) {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    
    let material;
    if (currentMap.texture_b64) {
        // Use real visual NASA texture mapping
        const texLoader = new THREE.TextureLoader();
        const tex = texLoader.load(currentMap.texture_b64);
        material = new THREE.MeshStandardMaterial({ 
            map: tex,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
    } else {
        // Flat Shading ile "Low-Poly" estetiği (Çok daha profesyonel durur)
        material = new THREE.MeshStandardMaterial({ 
            vertexColors: true,
            flatShading: true,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
    }
    
    terrainMesh = new THREE.Mesh(geometry, material);
    // Move origin so corner is (0,0) and rotate to be horizontal
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.position.set(w/2, 0, h/2);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
    
    // Bağımsız 3D Kaya (Rock) Objeleri Üretimi
    rockGroup = new THREE.Group();
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0); // Düşük poligonlu meteor/kaya görünümü
    const rockMat = new THREE.MeshStandardMaterial({
        color: 0xef4444, // Uyarı kırmızısı
        roughness: 0.8,
        flatShading: true
    });
    
    for(let y=0; y<h; y++) {
        for(let x=0; x<w; x++) {
            const cell = currentMap.grid[y][x];
            if(cell.is_obstacle && cell.rock > 0.5) {
                const rockMesh = new THREE.Mesh(rockGeo, rockMat);
                const baseElev = cell.elevation * 6.0;
                
                // Rotasyon ve boyut rasgeleliği
                const scale = 0.6 + Math.random() * 0.8;
                rockMesh.scale.set(scale, scale * 1.5, scale); // Dikey olarak hafif uzun
                
                // Hücre içine hafif dağınık yerleşim
                const rx = x + (Math.random() - 0.5) * 0.4;
                const rz = y + (Math.random() - 0.5) * 0.4;
                
                rockMesh.position.set(rx, baseElev + (scale * 0.5), rz);
                rockMesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
                
                rockMesh.castShadow = true;
                rockMesh.receiveShadow = true;
                rockGroup.add(rockMesh);
            }
        }
    }
    scene.add(rockGroup);
    
    // Alt ızgara (Holo-base grid)
    gridHelper = new THREE.GridHelper(Math.max(w,h) + 10, 20, 0x0ea5e9, 0x0ea5e9);
    gridHelper.position.set(w/2, -0.5, h/2);
    gridHelper.material.opacity = 0.15;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);
    
    // Rota çizimi (Glow Tube Geometry - Parlayan Neon Boru)
    // Path drawing as glowing tubes
    if(currentPath && currentPath.length > 1) {
        const pathPoints = [];
        for(let i=0; i<currentPath.length; i++) {
            const px = currentPath[i][0];
            const pz = currentPath[i][1];
            // Yüksekliği al, yeryüzünün biraz üstüne (hover) yerleştir
            const py = currentMap.grid[pz][px].elevation * 6.0 + 0.6;
            pathPoints.push(new THREE.Vector3(px, py, pz));
        }
        
        // Eğrileri pürüzsüzleştir
        const curve = new THREE.CatmullRomCurve3(pathPoints);
        const tubeGeo = new THREE.TubeGeometry(curve, pathPoints.length * 5, 0.15, 8, false);
        const tubeMat = new THREE.MeshStandardMaterial({ 
            color: 0x00ffcc, 
            emissive: 0x00ffcc, 
            emissiveIntensity: 0.8, 
            transparent: true, 
            opacity: 0.7 
        });
        pathLines = new THREE.Mesh(tubeGeo, tubeMat);
        scene.add(pathLines);
    }
    
    // Kaliteli Rover (Gezgin) Modeli
    if(roverPos) {
        const rx = roverPos[0];
        const rz = roverPos[1];
        const ry = currentMap.grid[rz][rx].elevation * 6.0 + 0.3; // zemin yüksekliği
        
        roverMesh = new THREE.Group();
        
        // Gövde (Body)
        const bodyGeo = new THREE.BoxGeometry(0.8, 0.4, 1.2);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.4;
        body.castShadow = true;
        roverMesh.add(body);
        
        // Güneş Paneli (Solar Panel)
        const panelGeo = new THREE.BoxGeometry(1.6, 0.05, 0.8);
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.9, roughness: 0.1 });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0, 0.65, -0.1);
        panel.castShadow = true;
        roverMesh.add(panel);

        // Sensör Vizörü / EKF Gözü (Camera)
        const eyeGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.5 });
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(0, 0.6, 0.5);
        roverMesh.add(eye);
        
        // Tekerlekler (Wheels)
        const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.9});
        const wheelPositions = [
            [-0.45, 0.2, 0.4], [0.45, 0.2, 0.4],
            [-0.45, 0.2, -0.4], [0.45, 0.2, -0.4]
        ];
        wheelPositions.forEach(pos => {
            const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
            wMesh.position.set(pos[0], pos[1], pos[2]);
            wMesh.castShadow = true;
            roverMesh.add(wMesh);
        });

        roverMesh.position.set(rx, ry, rz);
        
        // Yüzünü yola (next node) dönme işlemi
        if (currentPath && typeof simStep !== 'undefined' && simStep < currentPath.length - 1) {
            const nx = currentPath[simStep+1][0];
            const nz = currentPath[simStep+1][1];
            const ny = currentMap.grid[nz][nx].elevation * 6.0 + 0.3;
            roverMesh.lookAt(nx, ny, nz);
        }
        
        scene.add(roverMesh);
    }
    
    // Haritanın merkezine odakla ve kamera kontrolcüsüne bildir (sadece gerekliyse)
    if(resetCamera) {
        if(controls) {
            // Adapt camera distance based on map size so larger maps fit in view
            const dist = Math.max(w, h) * 1.5;
            camera.position.set(w/2, dist*0.6, h/2 + dist*0.8);
            
            controls.target.set(w/2, 0, h/2);
            controls.update();
        } else {
            camera.position.set(w/2, w*0.8, h*1.2);
            camera.lookAt(w/2, 0, h/2);
        }
        // Scene rotasyonunu sıfırla
        scene.rotation.y = 0;
    }
}

// ---------------- CORE LOGIC ----------------

async function generateMap() {
    logTerminal('[DEM] Parsing topographical arrays from LRO...', 'normal');
    try {
        const sizeInput = document.getElementById('map-size');
        const mapSize = sizeInput ? parseInt(sizeInput.value) || 50 : 50;
        const res = await fetch(`${API_BASE}/map?width=${mapSize}&height=${mapSize}`);
        currentMap = await res.json();
        
        // Update coord bounds based on dynamically loaded map size
        ['start-x', 'start-y', 'goal-x', 'goal-y'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.max = mapSize - 1;
                if (parseInt(el.value) >= mapSize) {
                    el.value = mapSize - 1;
                }
            }
        });
        
        currentPath = null; roverPos = null;
        simStep = 0; totalDistance = 0; 
        updateMetricsUI();
        drawMap();
        if(is3DMode) update3DMap(true);
        logTerminal('[DEM] Procedural terrain generation complete.', 'active');
        drawVisionCanvas([], null);
    } catch(e) {
        logTerminal('[ERR] Initialization failed: ' + e, 'err');
    }
}

async function planRoute(start, goal) {
    logTerminal(`[NAV] Mapping safe transit from (${start}) to (${goal})`, 'normal');
    try {
        const algo = document.getElementById('algo-select').value;
        const res = await fetch(`${API_BASE}/plan`, {
            method: 'POST', headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({start, goal, algorithm: algo})
        });
        const data = await res.json();
        
        if(data.error) {
            logTerminal('[ERR] ' + data.error, 'err');
            currentPath = null;
        } else if (data.path.length === 0) {
            logTerminal('[CRITICAL] NO SAFE TRAJECTORY AVAILABLE!', 'err');
            currentPath = null;
        } else {
            currentPath = data.path;
            if (data.warning) {
                logTerminal(`[WARN] ${data.warning} Cost: ${data.total_cost.toFixed(2)}`, 'warn');
            } else {
                logTerminal(`[NAV] Hybrid route optimized. Cost: ${data.total_cost.toFixed(2)}`, 'active');
            }
            drawMap();
            if(is3DMode) update3DMap();
        }
    } catch(e) {
        logTerminal('[ERR] Comm link broken.', 'err');
    }
}

async function simVisionUpdate() {
    if(!roverPos) return;
    try {
        const res = await fetch(`${API_BASE}/vision`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({x: roverPos[0], y: roverPos[1]})
        });
        const data = await res.json();
        
        let obstacles = data.objects || [];
        
        // Update Perception UI Metrics
        document.getElementById('iqi-val').innerText = data.iqi;
        const sensorEl = document.getElementById('active-sensor');
        sensorEl.innerText = data.primary_sensor;
        if(data.primary_sensor === '3D_LIDAR_SLAM') {
            sensorEl.style.color = '#ef4444';
        } else {
            sensorEl.style.color = '#10b981';
        }
        document.getElementById('ekf-var').innerText = data.ekf_variance;
        
        if(obstacles.length > 0) {
            logTerminal(`[EKF/APF] ${obstacles.length} hazards detected via ${data.primary_sensor}!`, 'warn');
            obstacles.forEach(obs => {
                currentMap.grid[obs.y][obs.x].is_obstacle = true;
                currentMap.grid[obs.y][obs.x].rock = 1.0;
            });
            
            if(document.getElementById('dynamic-replanning').checked) {
                logTerminal('[NAV] Obstacle collision course! Autoreplanning...', 'warn');
                const goalX = parseInt(document.getElementById('goal-x').value) || 0;
                const goalY = parseInt(document.getElementById('goal-y').value) || 0;
                await planRoute([roverPos[0], roverPos[1]], [goalX, goalY]);
                simStep = 0;
            }
        }
        
        // Pass API obstacles to standard vision draw
        drawVisionCanvas(obstacles, roverPos);
    } catch(e) { console.error(e); }
}

let visionOffset = 0;
function drawVisionCanvas(apiObstacles, pos) {
    const w = visionCanvas.width; const h = visionCanvas.height;
    visionCtx.fillStyle = '#0a0000'; visionCtx.fillRect(0,0,w,h);
    
    // Yüksek teknoloji LiDAR kırmızı lazer görünümü (Abstract wireframe perspective floor)
    visionCtx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
    visionCtx.lineWidth = 1;
    visionOffset = (visionOffset + 3) % 40;
    
    visionCtx.beginPath();
    for(let i=-200; i<w+200; i+=60) {
        visionCtx.moveTo(w/2, 20); visionCtx.lineTo(i, h);
    }
    for(let i=0; i<h-20; i+=15) {
        const y = 20 + i + (i > h/4 ? visionOffset/2 : 0);
        if(y<h) { visionCtx.moveTo(0, y); visionCtx.lineTo(w, y); }
    }
    visionCtx.stroke();

    for(let i=0; i<30; i++) {
        visionCtx.fillStyle = 'rgba(255,255,255,0.05)';
        visionCtx.fillRect(Math.random()*w, Math.random()*h, Math.random()*100, Math.random()*5);
    }

    let fovHazards = [];
    
    // 1. Ekleme: Haritadaki kalıcı tehlikeleri (Crater, Rock, Slope) FOV ile tarayıp ekle
    if (currentMap && pos) {
        const fovAngle = Math.PI / 2; // 90 derece geniş açı FOV
        const viewDist = 15; // 15 hücre uzağı görebilir
        
        for(let y = Math.max(0, pos[1]-viewDist); y <= Math.min(currentMap.height-1, pos[1]+viewDist); y++) {
            for(let x = Math.max(0, pos[0]-viewDist); x <= Math.min(currentMap.width-1, pos[0]+viewDist); x++) {
                if (x === pos[0] && y === pos[1]) continue; // Kendisi
                
                let dx = x - pos[0];
                let dy = y - pos[1];
                let dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist > viewDist) continue;
                
                let cell = currentMap.grid[y][x];
                let isHazard = false;
                let type = "";
                let color = "";
                
                if (cell.is_obstacle || cell.rock > 0.5) { isHazard = true; type = "ROCK_OBSTACLE"; color = "#ef4444"; }
                else if (cell.crater > 0.4) { isHazard = true; type = "CRATER_EDGE"; color = "#facc15"; }
                
                if (isHazard) {
                    let angleToTarget = Math.atan2(dy, dx);
                    let angleDiff = angleToTarget - currentYaw;
                    
                    // Açıyı normalize et
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    
                    if (Math.abs(angleDiff) < fovAngle / 2) {
                        fovHazards.push({
                            type: type,
                            color: color,
                            dist: dist,
                            angleDiff: angleDiff,
                            confidence: 1.0 // Haritada bilinen
                        });
                    }
                }
            }
        }
    }
    
    // 2. Ekleme: API'dan gelen yeni/dinamik tespit edilen (YOLO/Sensör Füzyon) engelleri FOV'a ekle
    if(apiObstacles && apiObstacles.length > 0) {
        apiObstacles.forEach(o => {
            let dx = o.x - pos[0];
            let dy = o.y - pos[1];
            let dist = Math.sqrt(dx*dx + dy*dy);
            let angleToTarget = Math.atan2(dy, dx);
            let angleDiff = angleToTarget - currentYaw;
            
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            fovHazards.push({
                type: o.type,
                color: '#8b5cf6', // Yeni dinamik engel (Mor)
                dist: dist,
                angleDiff: angleDiff,
                confidence: o.confidence
            });
        });
    }

    // Uzaktan yakına doğru sırala ki uzaktakiler arkada kalsın (Z-Index mantığı)
    fovHazards.sort((a, b) => b.dist - a.dist);
    
    // FPS Kamerası üzerinde objeleri Canvas'a (2D Projeksiyon) çiz (Sınır Kutuları / Bounding Box)
    fovHazards.forEach(hz => {
        // X ekseni projeksiyonu: angleDiff -FOV/2 ile +FOV/2 arasında
        // Bunu Canvas genişliğinde (0 ile W) map ediyoruz
        let pctX = (hz.angleDiff + (Math.PI/4)) / (Math.PI/2); 
        let px = pctX * w;
        
        // Gerçekçi Optik/FOV Projeksiyonu: (Yaklaştıkça üstel olarak büyüsün)
        let safeDist = Math.max(1.0, hz.dist);
        let sizeScale = 12.0 / safeDist; // 1 metredeyken 12x, 12 metredeyken 1x boyut
        
        let bw = 15 * sizeScale;
        let bh = 15 * sizeScale;
        let py = (h/2) + (5 * sizeScale);
        
        visionCtx.strokeStyle = hz.color;
        visionCtx.lineWidth = 2;
        
        // Kutuyu Çiz
        visionCtx.strokeRect(px - bw/2, py - bh/2, bw, bh);
        visionCtx.fillStyle = hz.color; 
        visionCtx.font = `${Math.floor(10 + 4*sizeScale)}px "Share Tech Mono"`;
        visionCtx.fillText(`${hz.type} [${hz.dist.toFixed(1)}m]`, px - bw/2, py - (bh/2) - 5);
        
        // Zemin Takip Çizgisi (Trackline)
        visionCtx.beginPath();
        visionCtx.moveTo(px, py + bh/2);
        visionCtx.lineTo(px, h);
        visionCtx.globalAlpha = 0.3;
        visionCtx.stroke();
        visionCtx.globalAlpha = 1.0;
    });

    visionCtx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    visionCtx.font = '14px "Orbitron"';
    visionCtx.fillText(`IMU PITCH: ${Math.floor(Math.random()*15 - 7)}°`, 40, h - 35);
    visionCtx.fillText(`IMU ROLL: ${Math.floor(Math.random()*15 - 7)}°`, 40, h - 55);
}

function drawMap() {
    if(!currentMap || is3DMode) return; // Skip 2D draw if 3D
    const w = currentMap.width; const h = currentMap.height;
    
    // Let's ensure canvas matches container css correctly to avoid stretch
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.width; 
    
    const cellW = canvas.width / w; 
    const cellH = canvas.height / h;

    ctx.clearRect(0,0, canvas.width, canvas.height);

    for(let y=0; y<h; y++) {
        for(let x=0; x<w; x++) {
            const cell = currentMap.grid[y][x];
            let color = '';
            
            if(cell.is_obstacle) {
                if(cell.rock > 0.5) color = '#ef4444';
                else if(cell.slope > 0.8) color = '#7c2d12'; 
                else color = '#ef4444';
            } else {
                if(cell.crater > 0.1) {
                    const c = Math.floor(70 - cell.crater * 40);
                    color = `rgb(${c},${c},${c+15})`; 
                } else if(cell.slope > 0.1) {
                    const tint = Math.floor(cell.slope * 120);
                    color = `rgb(${25+tint}, ${30+tint/2}, 55)`; 
                } else {
                    // Elevation based terrain color
                    const base = Math.floor(20 + cell.elevation * 40);
                    color = `rgb(${base}, ${base+5}, ${base+20})`; 
                }
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(Math.floor(x*cellW), Math.floor(y*cellH), Math.ceil(cellW), Math.ceil(cellH));
        }
    }

    ctx.strokeStyle = 'rgba(14, 165, 233, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let x=0; x<=w; x+=5) { ctx.moveTo(x*cellW, 0); ctx.lineTo(x*cellW, canvas.height); }
    for(let y=0; y<=h; y+=5) { ctx.moveTo(0, y*cellH); ctx.lineTo(canvas.width, y*cellH); }
    ctx.stroke();

    if(currentPath && currentPath.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#0ea5e9';
        
        ctx.moveTo(currentPath[0][0]*cellW + cellW/2, currentPath[0][1]*cellH + cellH/2);
        for(let i=1; i<currentPath.length; i++) {
            ctx.lineTo(currentPath[i][0]*cellW + cellW/2, currentPath[i][1]*cellH + cellH/2);
        }
        ctx.stroke();
        ctx.shadowBlur = 0; 
        
        ctx.fillStyle = '#8b5cf6';
        ctx.beginPath(); ctx.arc(currentPath[0][0]*cellW + cellW/2, currentPath[0][1]*cellH + cellH/2, 8, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.stroke();
        
        ctx.fillStyle = '#f59e0b';
        const last = currentPath[currentPath.length-1];
        ctx.beginPath(); ctx.arc(last[0]*cellW + cellW/2, last[1]*cellH + cellH/2, 8, 0, Math.PI*2); ctx.fill();
        ctx.stroke();
    }

    if(roverPos) {
        const rx = roverPos[0]*cellW + cellW/2;
        const ry = roverPos[1]*cellH + cellH/2;
        
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#10b981';
        ctx.beginPath(); ctx.arc(rx, ry, Math.max(6, cellW/2), 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
        ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(rx, ry, cellW*3.5, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)'; ctx.fill();
    }
}

function updateMetricsUI() {
    document.querySelector('.temp-dist').innerText = Math.floor(totalDistance);
    
    if(roverPos && currentMap) {
        const cell = currentMap.grid[roverPos[1]][roverPos[0]];
        // Bekker-Wong Theory Sinkage calculation (mock)
        const sinkage = 0.05 + (cell.slope * 0.1) + (cell.roughness * 0.05);
        const sinkEl = document.getElementById('sinkage-val');
        if (sinkEl) {
            sinkEl.innerText = sinkage.toFixed(3);
            if(sinkage > 0.1) sinkEl.style.color = '#ef4444';
            else sinkEl.style.color = '#10b981';
        }
        
        const riskBox = document.getElementById('risk-alert');
        riskBox.className = 'mini-telemetry';
        const txt = document.querySelector('.risk-max');
        if(sinkage > 0.12) {
            riskBox.style.borderLeft = '3px solid #ef4444';
            txt.innerText = 'SINKAGE CRITICAL';
            txt.style.color = '#ef4444';
        } else if (sinkage > 0.08) {
            riskBox.style.borderLeft = '3px solid #facc15';
            txt.innerText = 'APF AVOIDANCE';
            txt.style.color = '#facc15';
        } else {
            riskBox.style.borderLeft = '1px solid var(--panel-border)';
            txt.innerText = 'NOMİNAL';
            txt.style.color = '#10b981';
        }
    }
}

// EVENTS
UI.toggle3DBtn.addEventListener('click', () => {
    is3DMode = !is3DMode;
    if(is3DMode) {
        canvas.style.display = 'none';
        container3D.style.display = 'block';
        UI.toggle3DBtn.innerHTML = '2D GÖRÜNÜME DÖN';
        UI.toggle3DBtn.classList.add('btn-glow');
        UI.toggle3DBtn.classList.remove('btn-outline');
        if(!renderer) init3D();
        update3DMap(true);
    } else {
        canvas.style.display = 'block';
        container3D.style.display = 'none';
        UI.toggle3DBtn.innerHTML = '3D WEBGL GÖRÜNÜM';
        UI.toggle3DBtn.classList.remove('btn-glow');
        UI.toggle3DBtn.classList.add('btn-outline');
        drawMap();
    }
});

UI.genBtn.addEventListener('click', generateMap);

UI.planBtn.addEventListener('click', () => {
    const sx = parseInt(document.getElementById('start-x').value) || 0;
    const sy = parseInt(document.getElementById('start-y').value) || 0;
    const gx = parseInt(document.getElementById('goal-x').value) || 0;
    const gy = parseInt(document.getElementById('goal-y').value) || 0;
    planRoute([sx, sy], [gx, gy]);
});

UI.startBtn.addEventListener('click', async () => {
    if(simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        UI.startBtn.innerHTML = '<i class="fa-solid fa-play"></i> DEVAM ET';
        logTerminal('[SYS] Simulation halt threshold applied.', 'warn');
        return;
    }

    if(!currentPath || currentPath.length === 0) {
        logTerminal('[SYS] Auto-calculating missing trajectory...', 'normal');
        const sx = parseInt(document.getElementById('start-x').value) || 0;
        const sy = parseInt(document.getElementById('start-y').value) || 0;
        const gx = parseInt(document.getElementById('goal-x').value) || 0;
        const gy = parseInt(document.getElementById('goal-y').value) || 0;
        await planRoute([sx, sy], [gx, gy]);
        
        if(!currentPath || currentPath.length === 0) {
            logTerminal('[ERR] Mission aborted. No safe path found!', 'err');
            return;
        }
    }
    
    UI.startBtn.innerHTML = '<i class="fa-solid fa-pause"></i> SİSTEM DURAKLAT';
    logTerminal('[ENG] Thrusters locked. Rover deployed...', 'active');
    
    let isSimBusy = false;
    simulationInterval = setInterval(async () => {
        if(isSimBusy) return;
        isSimBusy = true;
        
        try {
            if(!currentPath || simStep >= currentPath.length) {
                clearInterval(simulationInterval);
                simulationInterval = null;
                logTerminal('[NAV] VECTOR ACHIVED. SAFEY SECURED.', 'active');
                UI.startBtn.innerHTML = '<i class="fa-solid fa-power-off"></i> SİMÜLASYONU BAŞLAT';
                return;
            }
            
            roverPos = currentPath[simStep];
            
            // FPS Kamera Yönünü Bekleyen Düğümden (Node) Hesapla
            if (simStep < currentPath.length - 1) {
                let nextPos = currentPath[simStep + 1];
                let dx = nextPos[0] - roverPos[0];
                let dy = nextPos[1] - roverPos[1];
                if (dx !== 0 || dy !== 0) {
                    currentYaw = Math.atan2(dy, dx);
                }
            }
            
            // Calculate actual distance moved
            if (simStep > 0) {
                let prev = currentPath[simStep-1];
                let dist = Math.sqrt(Math.pow(roverPos[0]-prev[0], 2) + Math.pow(roverPos[1]-prev[1], 2));
                totalDistance += dist; 
            } 
            
            if(is3DMode) {
                if(roverMesh && currentMap) {
                    const rx = roverPos[0];
                    const rz = roverPos[1];
                    const ry = currentMap.grid[rz][rx].elevation * 6.0 + 0.3;
                    roverMesh.position.set(rx, ry, rz);
                    if (simStep < currentPath.length - 1) {
                        const nx = currentPath[simStep+1][0];
                        const nz = currentPath[simStep+1][1];
                        const ny = currentMap.grid[nz][nx].elevation * 6.0 + 0.3;
                        roverMesh.lookAt(nx, ny, nz);
                    }
                } else {
                    update3DMap(); 
                }
            }
            else drawMap();
            
            updateMetricsUI();
            
            if(simStep % 3 === 0) {
                await simVisionUpdate();
            } else {
                drawVisionCanvas([], roverPos); 
            }
            
            simStep++;
        } finally {
            isSimBusy = false;
        }
    }, 300); 
});

window.addEventListener('resize', () => {
    if(!is3DMode) drawMap();
    if(renderer) {
        camera.aspect = container3D.clientWidth / container3D.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container3D.clientWidth, container3D.clientHeight);
    }
});

window.onload = generateMap;
