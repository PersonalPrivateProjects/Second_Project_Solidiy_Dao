
## Paso X: Generar ABIs para la web

```bash
cd ../sc
jq -r '.abi' out/DAOVoting.sol/DAOVoting2771.json > ../webapp/src/lib/DAOVoting.abi.json
jq -r '.abi' out/MinimalForwarder.sol/MinimalForwarder2771.json > ../webapp/src/lib/MinimalForwarder.abi.json