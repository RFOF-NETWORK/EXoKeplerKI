// api.js
// Backend: Serverless Worker (Cloudflare-kompatibel), neuronaler Graph, Validator, Feature-Toggles

// --- Feature-Toggles ---------------------------------------------------------
const FeatureToggles = {
  scenes: {
    'layered-sphere': true,
    'layered-plane': true
  },
  api: {
    getGraph: true,
    addNode: true,
    addLink: true
  },

  isSceneEnabled(key) {
    return !!this.scenes[key];
  },

  isApiEnabled(key) {
    return !!this.api[key];
  }
};

// --- In-Memory-Graphmodell ---------------------------------------------------
const GraphModel = (() => {
  // Realistischer Beispielgraph: mehrschichtiges neuronales Netz mit Metadaten
  const graph = {
    nodes: [],
    links: []
  };

  // Hilfsfunktionen
  const addNode = (node) => {
    if (graph.nodes.find(n => n.id === node.id)) {
      throw new Error(`Node mit ID ${node.id} existiert bereits`);
    }
    graph.nodes.push(node);
    return node;
  };

  const addLink = (link) => {
    graph.links.push(link);
    return link;
  };

  // Beispielnetz: Eingabe (Sensorik), Hidden (Feature-Extraktion), Output (Entscheidung)
  const seed = () => {
    if (graph.nodes.length > 0) return;

    const now = () => new Date().toISOString();

    const nodes = [
      // Input-Layer
      {
        id: 'in_vision',
        label: 'Visuelle Sensorik',
        type: 'input',
        layer: 'input',
        weight: 1.0,
        meta: {
          modality: 'vision',
          description: 'Rohdaten aus visuellen Sensoren (Kanten, Farben, Bewegung).',
          createdAt: now()
        }
      },
      {
        id: 'in_audio',
        label: 'Auditive Sensorik',
        type: 'input',
        layer: 'input',
        weight: 1.0,
        meta: {
          modality: 'audio',
          description: 'Rohdaten aus auditiven Sensoren (Frequenzen, Lautstärke, Rhythmus).',
          createdAt: now()
        }
      },
      {
        id: 'in_context',
        label: 'Kontext-Signale',
        type: 'input',
        layer: 'input',
        weight: 1.0,
        meta: {
          modality: 'context',
          description: 'Zeit, Ort, Historie, interne Zustände.',
          createdAt: now()
        }
      },

      // Hidden-Layer 1
      {
        id: 'h1_edges',
        label: 'Kanten-Detektor',
        type: 'hidden',
        layer: 'hidden_1',
        weight: 0.8,
        meta: {
          role: 'low-level feature',
          description: 'Extrahiert Kanten und Konturen aus visuellen Daten.',
          activationFn: 'ReLU'
        }
      },
      {
        id: 'h1_spectrogram',
        label: 'Spektrogramm-Analysator',
        type: 'hidden',
        layer: 'hidden_1',
        weight: 0.9,
        meta: {
          role: 'low-level feature',
          description: 'Analysiert Frequenzbänder und Muster in Audiodaten.',
          activationFn: 'ReLU'
        }
      },
      {
        id: 'h1_context_embed',
        label: 'Kontext-Embedding',
        type: 'hidden',
        layer: 'hidden_1',
        weight: 0.85,
        meta: {
          role: 'context embedding',
          description: 'Kodiert Kontextsignale in einen kontinuierlichen Raum.',
          activationFn: 'tanh'
        }
      },

      // Hidden-Layer 2
      {
        id: 'h2_multimodal',
        label: 'Multimodale Fusion',
        type: 'hidden',
        layer: 'hidden_2',
        weight: 1.1,
        meta: {
          role: 'fusion',
          description: 'Verschmilzt visuelle, auditive und Kontext-Merkmale.',
          activationFn: 'ReLU'
        }
      },
      {
        id: 'h2_pattern',
        label: 'Mustererkennung',
        type: 'hidden',
        layer: 'hidden_2',
        weight: 1.0,
        meta: {
          role: 'pattern recognition',
          description: 'Erkennt wiederkehrende Muster und Sequenzen.',
          activationFn: 'ReLU'
        }
      },

      // Output-Layer
      {
        id: 'out_decision',
        label: 'Entscheidungs-Neuron',
        type: 'output',
        layer: 'output',
        weight: 1.2,
        meta: {
          role: 'decision',
          description: 'Aggregiert Signale zu einer finalen Entscheidung.',
          activationFn: 'softmax'
        }
      },
      {
        id: 'out_uncertainty',
        label: 'Unsicherheits-Schätzer',
        type: 'output',
        layer: 'output',
        weight: 0.7,
        meta: {
          role: 'uncertainty',
          description: 'Schätzt Konfidenz und Risiko der Entscheidung.',
          activationFn: 'sigmoid'
        }
      }
    ];

    const links = [
      // Input → Hidden 1
      { source: 'in_vision', target: 'h1_edges', weight: 0.9 },
      { source: 'in_audio', target: 'h1_spectrogram', weight: 0.95 },
      { source: 'in_context', target: 'h1_context_embed', weight: 0.8 },

      // Cross-Input
      { source: 'in_vision', target: 'h1_spectrogram', weight: 0.3 },
      { source: 'in_audio', target: 'h1_edges', weight: 0.25 },

      // Hidden 1 → Hidden 2
      { source: 'h1_edges', target: 'h2_multimodal', weight: 0.85 },
      { source: 'h1_spectrogram', target: 'h2_multimodal', weight: 0.9 },
      { source: 'h1_context_embed', target: 'h2_multimodal', weight: 0.95 },
      { source: 'h1_edges', target: 'h2_pattern', weight: 0.7 },
      { source: 'h1_spectrogram', target: 'h2_pattern', weight: 0.75 },

      // Hidden 2 → Output
      { source: 'h2_multimodal', target: 'out_decision', weight: 1.1 },
      { source: 'h2_pattern', target: 'out_decision', weight: 0.9 },
      { source: 'h2_multimodal', target: 'out_uncertainty', weight: -0.4 },
      { source: 'h2_pattern', target: 'out_uncertainty', weight: 0.6 }
    ];

    nodes.forEach(addNode);
    links.forEach(addLink);
  };

  seed();

  return {
    getGraph() {
      return graph;
    },
    addNode,
    addLink
  };
})();

// --- Validator-System --------------------------------------------------------
const Validator = {
  rules: {
    node: {
      required: ['id', 'type'],
      allowedTypes: ['input', 'hidden', 'output']
    },
    link: {
      required: ['source', 'target'],
      weightRange: [-5, 5]
    }
  },

  validateJson(requestBody) {
    if (typeof requestBody !== 'object' || requestBody === null || Array.isArray(requestBody)) {
      return { ok: false, error: 'Payload muss ein JSON-Objekt sein.' };
    }
    return { ok: true };
  },

  validateNode(node) {
    const base = this.validateJson(node);
    if (!base.ok) return base;

    const { required, allowedTypes } = this.rules.node;
    for (const key of required) {
      if (!(key in node)) {
        return { ok: false, error: `Node-Feld fehlt: ${key}` };
      }
    }

    if (!allowedTypes.includes(node.type)) {
      return { ok: false, error: `Ungültiger Node-Typ: ${node.type}` };
    }

    if (node.weight != null && typeof node.weight !== 'number') {
      return { ok: false, error: 'Node-Gewicht muss eine Zahl sein.' };
    }

    if (node.meta != null && typeof node.meta !== 'object') {
      return { ok: false, error: 'Node-Metadaten müssen ein Objekt sein.' };
    }

    return { ok: true };
  },

  validateLink(link) {
    const base = this.validateJson(link);
    if (!base.ok) return base;

    const { required, weightRange } = this.rules.link;
    for (const key of required) {
      if (!(key in link)) {
        return { ok: false, error: `Link-Feld fehlt: ${key}` };
      }
    }

    if (typeof link.source !== 'string' || typeof link.target !== 'string') {
      return { ok: false, error: 'source und target müssen Strings sein.' };
    }

    if (link.weight != null) {
      if (typeof link.weight !== 'number') {
        return { ok: false, error: 'Link-Gewicht muss eine Zahl sein.' };
      }
      const [min, max] = weightRange;
      if (link.weight < min || link.weight > max) {
        return { ok: false, error: `Link-Gewicht muss zwischen ${min} und ${max} liegen.` };
      }
    }

    return { ok: true };
  }
};

// --- Utility: JSON-Response --------------------------------------------------
const jsonResponse = (data, init = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...init.headers
    },
    ...init
  });

// --- Router ------------------------------------------------------------------
const Router = {
  async handle(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (pathname === '/api/graph' && request.method === 'GET') {
      if (!FeatureToggles.isApiEnabled('getGraph')) {
        return jsonResponse({ error: 'GET /api/graph ist deaktiviert.' }, { status: 403 });
      }
      const graph = GraphModel.getGraph();
      return jsonResponse({
        ...graph,
        featureToggles: {
          scenes: FeatureToggles.scenes,
          api: FeatureToggles.api
        }
      });
    }

    if (pathname === '/api/node' && request.method === 'POST') {
      if (!FeatureToggles.isApiEnabled('addNode')) {
        return jsonResponse({ error: 'POST /api/node ist deaktiviert.' }, { status: 403 });
      }
      const body = await request.json().catch(() => null);
      const validation = Validator.validateNode(body);
      if (!validation.ok) {
        return jsonResponse({ error: validation.error }, { status: 400 });
      }
      try {
        const node = GraphModel.addNode({
          id: body.id,
          label: body.label || body.id,
          type: body.type,
          layer: body.layer || 'hidden_dynamic',
          weight: body.weight != null ? body.weight : 1.0,
          meta: body.meta || {}
        });
        return jsonResponse({ ok: true, node });
      } catch (err) {
        return jsonResponse({ error: err.message }, { status: 400 });
      }
    }

    if (pathname === '/api/link' && request.method === 'POST') {
      if (!FeatureToggles.isApiEnabled('addLink')) {
        return jsonResponse({ error: 'POST /api/link ist deaktiviert.' }, { status: 403 });
      }
      const body = await request.json().catch(() => null);
      const validation = Validator.validateLink(body);
      if (!validation.ok) {
        return jsonResponse({ error: validation.error }, { status: 400 });
      }

      const graph = GraphModel.getGraph();
      const sourceExists = graph.nodes.some(n => n.id === body.source);
      const targetExists = graph.nodes.some(n => n.id === body.target);
      if (!sourceExists || !targetExists) {
        return jsonResponse({ error: 'source oder target existiert nicht im Graph.' }, { status: 400 });
      }

      const link = GraphModel.addLink({
        source: body.source,
        target: body.target,
        weight: body.weight != null ? body.weight : 1.0
      });
      return jsonResponse({ ok: true, link });
    }

    // Fallback: einfache Info
    if (pathname.startsWith('/api/')) {
      return jsonResponse({
        error: 'Unbekannter API-Endpunkt.',
        endpoints: {
          'GET /api/graph': 'Liefert den aktuellen neuronalen Graphen.',
          'POST /api/node': 'Fügt einen Knoten hinzu (id, type, optional: label, layer, weight, meta).',
          'POST /api/link': 'Fügt eine Verbindung hinzu (source, target, optional: weight).'
        }
      }, { status: 404 });
    }

    // Non-API: Hinweis
    return new Response('Serverless neuronaler Graph-Worker. Frontend erwartet /app.js als statische Datei.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};

// --- Export: Worker-Handler --------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    try {
      return await Router.handle(request);
    } catch (err) {
      return jsonResponse({ error: 'Interner Serverfehler', detail: String(err) }, { status: 500 });
    }
  }
};
