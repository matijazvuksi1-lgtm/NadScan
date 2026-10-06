# NadScan

Monad wallet activity indexer for confirmed buys and sells, realised P&L and closed-position win rate.

## Deployment status

This repository is being prepared for an always-on Render indexer. Repository creation alone does not enable background scanning.

RPC credentials, database credentials and service authentication keys must be configured as server environment variables, never committed to this repository.

The existing private dashboard remains the source of administrator-managed trader profiles until the independent indexer is deployed and verified.
