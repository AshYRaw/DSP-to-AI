# DSP to AI: From Signal Processing to Deep Learning

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23585849.svg)](https://doi.org/10.5281/zenodo.23585849)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

**Live site:** https://ashyraw.github.io/DSP-to-AI/

Every concept in Mamba and Transformers has an exact mathematical counterpart in
classical Digital Signal Processing. This interactive site traces those connections,
from signals to state-space models and from filters to attention, and then examines
where the analogies hold and where they break.

## What's inside

27 chapters in five parts, with 51 interactive tools and a 74-term glossary.

| Part | Title | Chapters |
|---|---|---|
| I | DSP Foundations | 01–08: signals, systems, convolution, Fourier, z-transform, poles & zeros, filter design, adaptive filters |
| II | AI Foundations | 09–15: neurons, backprop, training, RNNs/LSTMs, embeddings, attention, the Transformer |
| III | The Bridge | 16–20: the Rosetta Stone, matched filter to attention, state-space models, Mamba, attention vs Mamba |
| IV | The Frontier | 21–23: SSM evolution, hybrid architectures, capstone project |
| V | The Critical Lens | 24–27: where analogies break, honest benchmarks, the bigger picture, the experimental frontier |

Also included: a [tool gallery](https://ashyraw.github.io/DSP-to-AI/gallery/) and a
[glossary](https://ashyraw.github.io/DSP-to-AI/reference/glossary.html).

## Running locally

The site is static HTML, CSS and vanilla JavaScript with no build step. Serve the
repository root with any static server, for example:

```sh
python3 -m http.server 8765
# then open http://localhost:8765/
```

`scripts/check_links.py` checks internal links, anchors and the chapter chain:

```sh
python3 scripts/check_links.py
```

## Citing

Every page has a "Cite this" box with APA and BibTeX. Machine-readable metadata is in
[`CITATION.cff`](CITATION.cff). The DOI above is the Zenodo concept DOI and always
resolves to the latest archived release.

```bibtex
@misc{rawat2026dsptoai,
  author       = {Rawat, Ashish},
  title        = {DSP to AI: From Signal Processing to Deep Learning},
  year         = {2026},
  doi          = {10.5281/zenodo.23585849},
  url          = {https://ashyraw.github.io/DSP-to-AI/},
  howpublished = {Interactive web resource},
  note         = {Licensed CC BY-NC-SA 4.0}
}
```

## License

[CC BY-NC-SA 4.0](LICENSE). Copyright (c) 2026 Ashish Rawat.
