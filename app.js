// app.js
// Frontend: Vanilla JS + Three.js (ESM via CDN), 3D-Universum, Auto-Discovery, Graph-Viewer

// --- Bootstrap minimal DOM ---------------------------------------------------
document.documentElement.lang = 'de';
document.title = 'Neuronales 3D-Universum';

const root = document.createElement('div');
root.id = 'app-root';
root.style.position = 'fixed';
root.style.inset = '0';
root.style.margin = '0';
root.style.overflow = 'hidden';
document.body.style.margin = '0';
document.body.appendChild(root);

const sidebar = document.createElement('div');
sidebar.id = 'sidebar';
sidebar.style.position = 'absolute';
sidebar.style.top = '0';
sidebar.style.right = '0';
sidebar.style.width = '280px';
sidebar.style.height = '100%';
sidebar.style.background = 'rgba(0,0,0,0.75)';
sidebar.style.color = '#eee';
sidebar.style.fontFamily = 'system-ui, sans-serif';
sidebar.style.fontSize = '13px';
sidebar.style.padding = '10px';
sidebar.style.boxSizing = 'border-box';
sidebar.style.display = 'flex';
sidebar.style.flexDirection = 'column';
sidebar.style.gap = '8px';
sidebar.style.pointerEvents = 'auto';
sidebar.style.zIndex = '10';

sidebar.innerHTML = `
  <h2 style="margin:0 0 6px 0;font-size:15px;">Neuronales Universum</h2>
  <div id="node-details" style="flex:1;overflow:auto;border:1px solid #444;padding:6px;border-radius:4px;background:rgba(10,10,10,0.7);">
    <em>Klicke auf einen Knoten, um Details zu sehen.</em>
  </div>
  <div style="margin-top:8px;">
    <label style="display:block;margin-bottom:4px;">Visualisierungsmodus</label>
    <select id="viz-mode" style="width:100%;padding:4px;border-radius:4px;border:1px solid #555;background:#111;color:#eee;">
    </select>
  </div>
  <div style="margin-top:8px;">
    <label style="display:block;margin-bottom:4px;">Szene</label>
    <select id="scene-select" style="width:100%;padding:4px;border-radius:4px;border:1px solid #555;background:#111;color:#eee;">
    </select>
  </div>
  <div id="status" style="margin-top:8px;color:#aaa;font-size:11px;"></div>
`;
root.appendChild(sidebar);

const canvasContainer = document.createElement('div');
canvasContainer.id = 'canvas-container';
canvasContainer.style.position = 'absolute';
canvasContainer.style.left = '0';
canvasContainer.style.top = '0';
canvasContainer.style.right = '280px';
canvasContainer.style.bottom = '0';
canvasContainer.style.overflow = 'hidden';
root.appendChild(canvasContainer);

// --- Dynamic import of Three.js + OrbitControls ------------------------------
const ThreeLoader = (() => {
  let cache = null;
  return {
    async load() {
      if (cache) return cache;
      const three = await import('https://unpkg.com/three@0.164.0/build/three.module.js');
      const controlsModule = await import('https://unpkg.com/three@0.164.0/examples/jsm/controls/OrbitControls.js');
      cache = { THREE: three, OrbitControls: controlsModule.OrbitControls };
      return cache;
    }
  };
})();

// --- Namespaces --------------------------------------------------------------

// Registry für Szenen
const Scenes = {
  _registry: {},
  register(key, factory) {
    this._registry[key] = factory;
  },
  list() {
    return Object.keys(this._registry);
  },
  create(key, context) {
    const factory = this._registry[key];
    if (!factory) throw new Error(`Szene nicht gefunden: ${key}`);
    return factory(context);
  }
};

// Registry für Visualisierungsmodi
const VisualizationModes = {
  _registry: {},
  register(key, label, applyFn) {
    this._registry[key] = { key, label, apply: applyFn };
  },
  list() {
    return Object.values(this._registry);
  },
  get(key) {
    return this._registry[key];
  }
};

// Graph-Client
const GraphAPI = {
  async fetchGraph() {
    const res = await fetch('/api/graph', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`Fehler beim Laden des Graphen: ${res.status}`);
    return res.json();
  },
  async addNode(node) {
    const res = await fetch('/api/node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(node)
    });
    if (!res.ok) throw new Error('Fehler beim Hinzufügen eines Knotens');
    return res.json();
  },
  async addLink(link) {
    const res = await fetch('/api/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(link)
    });
    if (!res.ok) throw new Error('Fehler beim Hinzufügen einer Verbindung');
    return res.json();
  }
};

// UI-Helfer
const UI = {
  statusEl: document.getElementById('status'),
  detailsEl: document.getElementById('node-details'),
  vizSelect: document.getElementById('viz-mode'),
  sceneSelect: document.getElementById('scene-select'),

  setStatus(msg) {
    this.statusEl.textContent = msg;
  },

  showNodeDetails(node, links) {
    if (!node) {
      this.detailsEl.innerHTML = '<em>Kein Knoten ausgewählt.</em>';
      return;
    }
    const connected = links
      .filter(l => l.source === node.id || l.target === node.id)
      .map(l => (l.source === node.id ? l.target : l.source));

    this.detailsEl.innerHTML = `
      <div><strong>ID:</strong> ${node.id}</div>
      <div><strong>Label:</strong> ${node.label || '-'}</div>
      <div><strong>Typ:</strong> ${node.type || '-'}</div>
      <div><strong>Gewicht:</strong> ${node.weight != null ? node.weight : '-'}</div>
      <div><strong>Ebene:</strong> ${node.layer || '-'}</div>
      <div style="margin-top:6px;"><strong>Verbunden mit:</strong> ${connected.length ? connected.join(', ') : '<em>keine</em>'}</div>
      <div style="margin-top:6px;"><strong>Metadaten:</strong><pre style="white-space:pre-wrap;font-size:11px;">${JSON.stringify(node.meta || {}, null, 2)}</pre></div>
    `;
  },

  populateVizModes(modes) {
    this.vizSelect.innerHTML = '';
    for (const mode of modes) {
      const opt = document.createElement('option');
      opt.value = mode.key;
      opt.textContent = mode.label;
      this.vizSelect.appendChild(opt);
    }
  },

  populateScenes(sceneKeys) {
    this.sceneSelect.innerHTML = '';
    for (const key of sceneKeys) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      this.sceneSelect.appendChild(opt);
    }
  }
};

// --- 3D-Engine ---------------------------------------------------------------
const Engine = {
  three: null,
  controls: null,
  renderer: null,
  camera: null,
  scene: null,
  raycaster: null,
  mouse: null,
  graphData: null,
  nodeMeshes: new Map(),
  linkLines: [],
  currentSceneKey: null,
  currentVizKey: null,

  async init() {
    const { THREE, OrbitControls } = await ThreeLoader.load();
    this.three = THREE;

    const width = canvasContainer.clientWidth || window.innerWidth - 280;
    const height = canvasContainer.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x050509, 1);
    canvasContainer.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050509, 0.02);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 20, 40);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;
    this.controls = controls;

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(20, 40, 10);
    scene.add(dir);

    const grid = new THREE.GridHelper(80, 40, 0x333333, 0x111111);
    grid.position.y = -15;
    scene.add(grid);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    this.raycaster = raycaster;
    this.mouse = mouse;

    window.addEventListener('resize', () => this.onResize());
    renderer.domElement.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    this.animate();
  },

  onResize() {
    if (!this.camera || !this.renderer) return;
    const width = canvasContainer.clientWidth || window.innerWidth - 280;
    const height = canvasContainer.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  },

  onPointerDown(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(Array.from(this.nodeMeshes.values()));
    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const nodeId = mesh.userData.nodeId;
      const node = this.graphData.nodes.find(n => n.id === nodeId);
      UI.showNodeDetails(node, this.graphData.links);
    }
  },

  animate() {
    requestAnimationFrame(() => this.animate());
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  },

  clearScene() {
    if (!this.scene) return;
    const toRemove = [];
    this.scene.traverse(obj => {
      if (obj.isMesh || obj.isLine) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
      this.scene.remove(obj);
    });
    this.nodeMeshes.clear();
    this.linkLines = [];
  },

  applyVisualizationMode() {
    if (!this.graphData || !this.currentVizKey) return;
    const mode = VisualizationModes.get(this.currentVizKey);
    if (!mode) return;
    mode.apply(this.graphData, this.nodeMeshes, this.linkLines, this.three);
  },

  async loadGraphAndScene(sceneKey, vizKey) {
    UI.setStatus('Lade Graph-Daten ...');
    const graph = await GraphAPI.fetchGraph();
    this.graphData = graph;
    this.currentSceneKey = sceneKey;
    this.currentVizKey = vizKey;

    this.clearScene();

    const sceneInstance = Scenes.create(sceneKey, {
      THREE: this.three,
      scene: this.scene,
      graph
    });

    // Knoten-Meshes registrieren
    for (const node of sceneInstance.nodes) {
      this.nodeMeshes.set(node.id, node.mesh);
    }
    this.linkLines = sceneInstance.links;

    this.applyVisualizationMode();
    UI.setStatus(`Graph geladen: ${graph.nodes.length} Knoten, ${graph.links.length} Verbindungen.`);
  }
};

// --- Szenen-Registrierung ----------------------------------------------------

// Szene: Kugel-Cluster – Schichten als konzentrische Sphären
Scenes.register('layered-sphere', ({ THREE, scene, graph }) => {
  const nodes = [];
  const links = [];

  const layerGroups = {};
  for (const node of graph.nodes) {
    const layer = node.layer || 'default';
    if (!layerGroups[layer]) layerGroups[layer] = [];
    layerGroups[layer].push(node);
  }

  const layers = Object.keys(layerGroups);
  const baseRadius = 8;
  const layerStep = 4;

  const nodeGeo = new THREE.SphereGeometry(0.6, 24, 24);

  layers.forEach((layer, layerIndex) => {
    const radius = baseRadius + layerIndex * layerStep;
    const groupNodes = layerGroups[layer];
    const count = groupNodes.length;

    groupNodes.forEach((node, i) => {
      const phi = Math.acos(2 * (i + 0.5) / count - 1);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(theta) * Math.sin(phi);

      const color = node.type === 'input'
        ? 0x4caf50
        : node.type === 'output'
          ? 0xff9800
          : node.type === 'hidden'
            ? 0x2196f3
            : 0x9c27b0;

      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        metalness: 0.2,
        roughness: 0.4
      });

      const mesh = new THREE.Mesh(nodeGeo, mat);
      mesh.position.set(x, y, z);
      mesh.userData.nodeId = node.id;
      scene.add(mesh);

      nodes.push({ id: node.id, mesh });
    });
  });

  const nodeById = new Map(nodes.map(n => [n.id, n.mesh]));
  const linkMat = new THREE.LineBasicMaterial({ color: 0x8888ff, transparent: true, opacity: 0.6 });

  for (const link of graph.links) {
    const sourceMesh = nodeById.get(link.source);
    const targetMesh = nodeById.get(link.target);
    if (!sourceMesh || !targetMesh) continue;

    const geo = new THREE.BufferGeometry().setFromPoints([
      sourceMesh.position,
      targetMesh.position
    ]);
    const line = new THREE.Line(geo, linkMat);
    scene.add(line);
    links.push(line);
  }

  return { nodes, links };
});

// Szene: Projektion auf Ebene – Layout nach Layer und Index
Scenes.register('layered-plane', ({ THREE, scene, graph }) => {
  const nodes = [];
  const links = [];

  const layerGroups = {};
  for (const node of graph.nodes) {
    const layer = node.layer || 'default';
    if (!layerGroups[layer]) layerGroups[layer] = [];
    layerGroups[layer].push(node);
  }

  const layers = Object.keys(layerGroups);
  const layerSpacing = 8;
  const nodeSpacing = 2.5;

  const nodeGeo = new THREE.SphereGeometry(0.7, 20, 20);

  layers.forEach((layer, layerIndex) => {
    const groupNodes = layerGroups[layer];
    const offsetX = -((groupNodes.length - 1) * nodeSpacing) / 2;
    const z = (layerIndex - (layers.length - 1) / 2) * layerSpacing;

    groupNodes.forEach((node, i) => {
      const x = offsetX + i * nodeSpacing;
      const y = 0;

      const color = node.type === 'input'
        ? 0x8bc34a
        : node.type === 'output'
          ? 0xffc107
          : node.type === 'hidden'
            ? 0x03a9f4
            : 0xe91e63;

      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.2,
        metalness: 0.1,
        roughness: 0.5
      });

      const mesh = new THREE.Mesh(nodeGeo, mat);
      mesh.position.set(x, y, z);
      mesh.userData.nodeId = node.id;
      scene.add(mesh);

      nodes.push({ id: node.id, mesh });
    });
  });

  const nodeById = new Map(nodes.map(n => [n.id, n.mesh]));
  const linkMat = new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.7 });

  for (const link of graph.links) {
    const sourceMesh = nodeById.get(link.source);
    const targetMesh = nodeById.get(link.target);
    if (!sourceMesh || !targetMesh) continue;

    const geo = new THREE.BufferGeometry().setFromPoints([
      sourceMesh.position,
      targetMesh.position
    ]);
    const line = new THREE.Line(geo, linkMat);
    scene.add(line);
    links.push(line);
  }

  return { nodes, links };
});

// --- Visualisierungsmodi -----------------------------------------------------

// Modus: Gewicht → Linienfarbe + -stärke
VisualizationModes.register('weight-links', 'Gewicht: Verbindungen hervorheben', (graph, nodeMeshes, linkLines, THREE) => {
  const weights = graph.links.map(l => Math.abs(l.weight || 0));
  const maxW = weights.length ? Math.max(...weights) || 1 : 1;

  linkLines.forEach((line, idx) => {
    const link = graph.links[idx];
    const w = Math.abs(link.weight || 0) / maxW;
    const color = link.weight >= 0 ? new THREE.Color(0x00e676) : new THREE.Color(0xff1744);
    const mat = new THREE.LineBasicMaterial({
      color,
      linewidth: 1,
      transparent: true,
      opacity: 0.3 + 0.7 * w
    });
    line.material.dispose();
    line.material = mat;
  });

  nodeMeshes.forEach(mesh => {
    if (mesh.material && mesh.material.emissive) {
      mesh.material.emissiveIntensity = 0.25;
    }
  });
});

// Modus: Aktivierung → Knoten-Glühen nach Gewichtssumme
VisualizationModes.register('activation-nodes', 'Aktivierung: Knoten glühen', (graph, nodeMeshes, linkLines, THREE) => {
  const activation = new Map();
  graph.nodes.forEach(n => activation.set(n.id, 0));

  graph.links.forEach(l => {
    const prev = activation.get(l.target) || 0;
    activation.set(l.target, prev + (l.weight || 0));
  });

  let maxAbs = 0;
  activation.forEach(v => { maxAbs = Math.max(maxAbs, Math.abs(v)); });
  if (maxAbs === 0) maxAbs = 1;

  nodeMeshes.forEach((mesh, id) => {
    const act = activation.get(id) || 0;
    const norm = Math.abs(act) / maxAbs;
    const color = act >= 0 ? new THREE.Color(0x00bcd4) : new THREE.Color(0xff4081);
    if (mesh.material) {
      mesh.material.color = color.clone().multiplyScalar(0.7 + 0.3 * norm);
      mesh.material.emissive = color;
      mesh.material.emissiveIntensity = 0.2 + 0.8 * norm;
    }
  });

  linkLines.forEach(line => {
    if (line.material) {
      line.material.opacity = 0.4;
      line.material.color = new THREE.Color(0x777777);
    }
  });
});

// Modus: Neutral – Standardfarben
VisualizationModes.register('neutral', 'Neutral', (graph, nodeMeshes, linkLines, THREE) => {
  linkLines.forEach(line => {
    if (line.material) {
      line.material.color = new THREE.Color(0x8888ff);
      line.material.opacity = 0.6;
    }
  });
  nodeMeshes.forEach(mesh => {
    if (mesh.material && mesh.material.emissive) {
      mesh.material.emissiveIntensity = 0.25;
    }
  });
});

// --- Auto-Discovery-Initialisierung -----------------------------------------
(async () => {
  try {
    UI.setStatus('Initialisiere 3D-Engine ...');
    await Engine.init();

    const sceneKeys = Scenes.list();
    const vizModes = VisualizationModes.list();

    UI.populateScenes(sceneKeys);
    UI.populateVizModes(vizModes);

    UI.sceneSelect.value = sceneKeys[0] || '';
    UI.vizSelect.value = 'neutral';

    UI.sceneSelect.addEventListener('change', () => {
      Engine.loadGraphAndScene(UI.sceneSelect.value, UI.vizSelect.value)
        .catch(err => UI.setStatus(`Fehler: ${err.message}`));
    });

    UI.vizSelect.addEventListener('change', () => {
      Engine.currentVizKey = UI.vizSelect.value;
      Engine.applyVisualizationMode();
    });

    await Engine.loadGraphAndScene(UI.sceneSelect.value, UI.vizSelect.value);
  } catch (err) {
    UI.setStatus(`Initialisierungsfehler: ${err.message}`);
    console.error(err);
  }
})();
