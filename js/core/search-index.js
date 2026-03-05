/* ============================================================
   DSP to AI — Search Index
   Searchable metadata for all chapters, sections, and tools.
   Used by search.js for site-wide search.
   ============================================================ */

window.DSPtoAI = window.DSPtoAI || {};

window.DSPtoAI.searchIndex = [
  // ── Part I: DSP Foundations ──────────────────────────────
  {
    id: 'ch01', part: 'Part I', partId: 'part1', num: '01',
    title: 'What Is a Signal?',
    file: 'chapters/part1/ch01-signals.html',
    sections: ['Signals Are Everywhere', 'Continuous vs Discrete', 'Sampling & Aliasing'],
    keywords: 'signal sampling Nyquist aliasing discrete continuous ADC DAC waveform sine frequency amplitude',
    tools: ['Signal Laboratory', 'Aliasing Demonstrator']
  },
  {
    id: 'ch02', part: 'Part I', partId: 'part1', num: '02',
    title: 'Systems That Process Signals',
    file: 'chapters/part1/ch02-systems.html',
    sections: ['Systems & Black Boxes', 'Linearity', 'Time Invariance'],
    keywords: 'system LTI linear time-invariant impulse response black box superposition',
    tools: ['System Black Box', 'Impulse Response Explorer']
  },
  {
    id: 'ch03', part: 'Part I', partId: 'part1', num: '03',
    title: 'Convolution',
    file: 'chapters/part1/ch03-convolution.html',
    sections: ['The Convolution Operation', 'Discrete Convolution', '2D Convolution'],
    keywords: 'convolution kernel filter sliding dot product overlap-add 2D image CNN cross-correlation',
    tools: ['Convolution Visualizer', '2D Convolution Viewer']
  },
  {
    id: 'ch04', part: 'Part I', partId: 'part1', num: '04',
    title: 'The Fourier Transform',
    file: 'chapters/part1/ch04-fourier.html',
    sections: ['Fourier Series', 'The Fourier Transform', 'The Discrete Fourier Transform'],
    keywords: 'Fourier FFT DFT frequency spectrum magnitude phase harmonic sinusoid spectrogram',
    tools: ['Fourier Decomposition Playground', 'Real-Time Spectrum Analyzer', 'Spectrogram Viewer']
  },
  {
    id: 'ch05', part: 'Part I', partId: 'part1', num: '05',
    title: 'Z-Transform & Transfer Functions',
    file: 'chapters/part1/ch05-z-transform.html',
    sections: ['The Z-Transform', 'Transfer Functions'],
    keywords: 'z-transform transfer function ROC region convergence unit circle polynomial complex',
    tools: ['Z-Transform Visual Computer']
  },
  {
    id: 'ch06', part: 'Part I', partId: 'part1', num: '06',
    title: 'Poles, Zeros & Filter Character',
    file: 'chapters/part1/ch06-poles-zeros.html',
    sections: ['Pole-Zero Diagrams', 'Stability', 'Frequency Response from Poles/Zeros'],
    keywords: 'pole zero stability unit circle frequency response magnitude phase conjugate pair',
    tools: ['Pole-Zero Designer']
  },
  {
    id: 'ch07', part: 'Part I', partId: 'part1', num: '07',
    title: 'FIR & IIR Filter Design',
    file: 'chapters/part1/ch07-filter-design.html',
    sections: ['FIR Filters', 'IIR Filters', 'Filter Design Trade-offs'],
    keywords: 'FIR IIR filter lowpass highpass bandpass notch windowed sinc Butterworth Chebyshev Parks-McClellan',
    tools: ['Filter Design Workbench', 'Audio Filter Playground']
  },
  {
    id: 'ch08', part: 'Part I', partId: 'part1', num: '08',
    title: 'Adaptive Filters & Filter Banks',
    file: 'chapters/part1/ch08-advanced-dsp.html',
    sections: ['Adaptive Filters', 'The Matched Filter', 'Filter Banks'],
    keywords: 'adaptive LMS RLS Wiener filter bank sub-band decomposition multirate polyphase noise cancellation matched filter cross-correlation detection SNR optimal template radar sonar',
    tools: ['Adaptive Noise Canceller', 'Matched Filter Detector', 'Filter Bank Decomposer']
  },

  // ── Part II: AI Foundations ──────────────────────────────
  {
    id: 'ch09', part: 'Part II', partId: 'part2', num: '09',
    title: 'The Neuron & Perceptron',
    file: 'chapters/part2/ch09-neuron.html',
    sections: ['The Biological Inspiration', 'The McCulloch-Pitts Neuron', 'Activation Functions'],
    keywords: 'neuron perceptron sigmoid tanh ReLU activation weight bias threshold classification',
    tools: ['Single Neuron Playground', 'Activation Function Gallery']
  },
  {
    id: 'ch10', part: 'Part II', partId: 'part2', num: '10',
    title: 'Neural Networks & Backpropagation',
    file: 'chapters/part2/ch10-backprop.html',
    sections: ['Forward Pass', 'The Chain Rule', 'Gradient Descent'],
    keywords: 'backpropagation gradient chain rule neural network layer MLP forward backward pass loss',
    tools: ['Neural Network Builder', 'Backprop Step-Through']
  },
  {
    id: 'ch11', part: 'Part II', partId: 'part2', num: '11',
    title: 'Training & Optimization',
    file: 'chapters/part2/ch11-training.html',
    sections: ['Optimization Algorithms', 'Regularization', 'Gradient Dynamics'],
    keywords: 'SGD Adam momentum learning rate loss landscape optimizer regularization dropout batch normalization',
    tools: ['Loss Landscape Explorer', 'Learning Rate Finder']
  },
  {
    id: 'ch12', part: 'Part II', partId: 'part2', num: '12',
    title: 'RNNs & LSTMs',
    file: 'chapters/part2/ch12-sequences.html',
    sections: ['Recurrent Neural Networks', 'LSTM and GRU'],
    keywords: 'RNN LSTM GRU recurrent sequence vanishing gradient hidden state forget gate memory cell',
    tools: ['RNN Unroller', 'Vanishing Gradient Demonstrator']
  },
  {
    id: 'ch13', part: 'Part II', partId: 'part2', num: '13',
    title: 'Word Embeddings',
    file: 'chapters/part2/ch13-embeddings.html',
    sections: ['Learned Representations', 'Embedding Spaces'],
    keywords: 'embedding Word2Vec GloVe cosine similarity vector space semantic king queen analogy',
    tools: ['Embedding Space Explorer']
  },
  {
    id: 'ch14', part: 'Part II', partId: 'part2', num: '14',
    title: 'The Attention Mechanism',
    file: 'chapters/part2/ch14-attention.html',
    sections: ['The Attention Mechanism', 'Multi-Head Attention', 'Attention as Matched Filtering'],
    keywords: 'attention query key value QKV softmax scaled dot-product multi-head self-attention cross-attention',
    tools: ['Attention Mechanism Visualizer', 'Attention as Matched Filtering']
  },
  {
    id: 'ch15', part: 'Part II', partId: 'part2', num: '15',
    title: 'The Transformer',
    file: 'chapters/part2/ch15-transformer.html',
    sections: ['The Transformer Block', 'Multi-Layer Transformers', 'Positional Encoding'],
    keywords: 'transformer encoder decoder positional encoding layer normalization feed-forward residual connection BERT GPT',
    tools: ['Transformer Block Explorer', 'Positional Encoding Visualizer']
  },

  // ── Part III: The Bridge ─────────────────────────────────
  {
    id: 'ch16', part: 'Part III', partId: 'part3', num: '16',
    title: 'The Rosetta Stone',
    file: 'chapters/part3/ch16-rosetta.html',
    sections: ['DSP-to-AI Concept Mapping'],
    keywords: 'Rosetta Stone mapping equivalence FIR attention IIR SSM filter bank multi-head convolution kernel',
    tools: ['Dual-View Concept Explorer']
  },
  {
    id: 'ch17', part: 'Part III', partId: 'part3', num: '17',
    title: 'Matched Filter to Attention',
    file: 'chapters/part3/ch17-matched-to-attn.html',
    sections: ['The Fixed Matched Filter', 'The Adaptive Filter Bank', 'Learned Q/K Projections', 'Full Multi-Head Self-Attention', 'The Full Picture'],
    keywords: 'matched filter correlation template detector adaptive attention evolution bridge DSP signal detection',
    tools: ['Evolution Playground']
  },
  {
    id: 'ch18', part: 'Part III', partId: 'part3', num: '18',
    title: 'State-Space Models',
    file: 'chapters/part3/ch18-ssm.html',
    sections: ['The Continuous State-Space Form', 'Discretization', 'Discretized SSM = IIR Filter', 'HiPPO — Optimal History Compression', 'S4 — Structured State Spaces', 'The Convolution-Recurrence Duality'],
    keywords: 'SSM state-space HiPPO S4 discretization ZOH Legendre polynomial DPLR Cauchy kernel convolution recurrence duality',
    tools: ['State-Space Simulator', 'HiPPO Visualizer', 'Convolution-Recurrence Duality']
  },
  {
    id: 'ch19', part: 'Part III', partId: 'part3', num: '19',
    title: 'Mamba',
    file: 'chapters/part3/ch19-mamba.html',
    sections: ['The S4 Limitation', 'The Selection Mechanism', 'The Hardware-Aware Parallel Scan', 'The Mamba Block', 'Mamba as Learnable IIR Filter Bank', 'The Computational Advantage'],
    keywords: 'Mamba selective scan input-dependent SSM parallel scan hardware-aware IIR filter bank SiLU gating linear time',
    tools: ['Mamba Block Simulator', 'Selective Scan Visualizer', 'Mamba-IIR Filter Bank']
  },
  {
    id: 'ch20', part: 'Part III', partId: 'part3', num: '20',
    title: 'Attention vs Mamba',
    file: 'chapters/part3/ch20-attn-vs-mamba.html',
    sections: ['The Two Paradigms', 'O(n²) vs O(n) Scaling', 'Memory & State', 'FIR vs IIR Full Circle', 'When Each Wins', 'The Hybrid Future'],
    keywords: 'attention Mamba comparison FIR IIR O(n²) O(n) KV-cache fixed state retrieval compression hybrid',
    tools: ['Scaling Explorer', 'FIR vs IIR Filter Paradigm', 'Head-to-Head Arena']
  },

  // ── Part IV: The Frontier ────────────────────────────────
  {
    id: 'ch21', part: 'Part IV', partId: 'part4', num: '21',
    title: 'SSM Evolution Timeline',
    file: 'chapters/part4/ch21-ssm-evolution.html',
    sections: ['Era 1 — Foundations', 'Era 2 — Efficient Architecture', 'Era 3 — The Mamba Breakthrough', 'Era 4 — The Hybrid Revolution', 'Era 5 — Edge & Future', 'The DSP Thread'],
    keywords: 'HiPPO S4 H3 Hyena RWKV RetNet Mamba Mamba-2 Jamba Griffin Bamba GLA Based evolution timeline',
    tools: ['SSM Evolution Timeline']
  },
  {
    id: 'ch22', part: 'Part IV', partId: 'part4', num: '22',
    title: 'Hybrid Architectures',
    file: 'chapters/part4/ch22-hybrid-architectures.html',
    sections: ['Why Go Hybrid?', 'The Hybrid Design Space', 'Real Hybrid Models', 'Mixture of Experts', 'The DSP Principle — Cascading Filters', 'Edge Deployment'],
    keywords: 'hybrid architecture Jamba Griffin Bamba attention ratio MoE mixture experts interleave SSM edge NPU FPGA',
    tools: ['Hybrid Architecture Designer']
  },
  {
    id: 'ch23', part: 'Part IV', partId: 'part4', num: '23',
    title: 'Capstone Project',
    file: 'chapters/part4/ch23-capstone.html',
    sections: ['The Challenge', 'The Complete Pipeline', 'The 12 Full-Circle Connections', 'Reflection'],
    keywords: 'capstone project pipeline DSP AI full circle connection sampling tokenization convolution attention state space',
    tools: ['Capstone Integrator']
  },

  // ── Part V: The Critical Lens ──────────────────────────────
  {
    id: 'ch24', part: 'Part V', partId: 'part5', num: '24',
    title: 'Where Analogies Break',
    file: 'chapters/part5/ch24-analogy-limits.html',
    sections: ['The Matched Filter ↔ Attention Analogy', 'The IIR ↔ Mamba Analogy', 'The FIR/IIR Mapping Is Incomplete', 'HiPPO ↔ Butterworth: Different Optimization Spaces'],
    keywords: 'analogy limits matched filter attention softmax linear nonlinearity IIR LTV LTI Mamba Kalman Lyapunov stability HiPPO Butterworth pole placement FIR information bottleneck KV-cache',
    tools: ['Analogy Spectrum', 'LTI vs LTV Explorer']
  },
  {
    id: 'ch25', part: 'Part V', partId: 'part5', num: '25',
    title: 'Honest Benchmarks',
    file: 'chapters/part5/ch25-honest-benchmarks.html',
    sections: ['Why Convolution Helps Mamba', 'Benchmark Comparisons Are Not Apples-to-Apples', 'The Expressiveness Hierarchy Is Contested', 'Numbers Need Context'],
    keywords: 'benchmark comparison parameter count bidirectional causal WER LibriSpeech expressiveness hierarchy bias variance TC0 Turing complete ConMamba Conformer Samba-ASR training data fairness iso-parameter iso-FLOP',
    tools: ['Benchmark Dissector', 'Expressiveness vs Generalization']
  },
  {
    id: 'ch26', part: 'Part V', partId: 'part5', num: '26',
    title: 'The Bigger Picture',
    file: 'chapters/part5/ch26-bigger-picture.html',
    sections: ['Does "One Framework, Two Languages" Overstate the Connection?', 'What Attention Can Do That SSMs Cannot', 'The Honest Summary: What DSP Teaches Us', 'Updated Landscape (2025-2026)'],
    keywords: 'structural isomorphism functional equivalence in-context learning ICL LMS adaptive filter compositionality variable binding Mamba-2 SSD Mamba-3 hidden attention Lyapunov Jamba Griffin Zamba Bamba hybrid convergence',
    tools: ['Analogy Map', 'ICL Mechanism Comparator']
  },
  {
    id: 'ch27', part: 'Part V', partId: 'part5', num: '27',
    title: 'The Experimental Frontier',
    file: 'chapters/part5/ch27-experimental-frontier.html',
    sections: ['The Filter Probe', 'Mamba-Vocoder', 'DSP-Guided Architecture Search', 'Stability Analysis of Trained Models', 'DSP-Mamba: The Ultimate Test'],
    keywords: 'filter probe formant vocoder IIR synthesis architecture search autocorrelation stability Lyapunov exponent DSP-Mamba initialization Butterworth Bessel HiPPO bandwidth control cepstral experimental research program',
    tools: ['Filter Probe Simulator', 'DSP-Mamba Architect']
  }
];
