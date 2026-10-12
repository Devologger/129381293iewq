# Strategy provenance

The bundled `research/directional_fib_anchor_model.py` derives from Devologger/312897ads, branch `custom-fib-app-integration`, commit `6f4cd8e7b9ff79ed390bbcbd305440869132cc6e`. Its canonical ratios and directional conventions are preserved. The source repository and this repository include GPL-3.0 license texts.

The terminal UI and bounded research harness were developed for this workspace. There is no runtime dependency on that reference checkout, its database, authentication, API server, or worker processes.

Bundled Geist fonts came from `geist@1.4.2`; the corresponding license is in `public/fonts/LICENSE.txt`.

The optional FreeRideV3 gateway is installed separately from https://github.com/Shaivpidadi/FreeRideV3 at revision `3811c8e29ef41d96eea2fe37d0219c1790e530b1`. Its upstream MIT license is included in its installed distribution/source. Penguin provides an adapter around that engine; it does not bundle the upstream source or enable every upstream integration.
