
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../src/MinimalForwarder.sol";
import "../src/DAOVoting.sol";

contract DeployScript is Script {
    function run() external {
        // 1) Leer claves/params del entorno
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint256 minimumBalance = vm.envOr("MINIMUM_BALANCE", uint256(0.1 ether));

        // 2) Iniciar broadcast con la clave del deployer
        vm.startBroadcast(deployerPrivateKey);

        // 3) Desplegar el forwarder primero
        MinimalForwarder2771 forwarder = new MinimalForwarder2771();
        console2.log("MinimalForwarder deployed at:", address(forwarder));

        // 4) Desplegar el DAO con forwarder y minBalance
        DAOVoting2771 dao = new DAOVoting2771(address(forwarder), minimumBalance);
        console2.log("DAOVoting deployed at:", address(dao));

        // 5) Finalizar broadcast
        vm.stopBroadcast();

        // 6) Resumen
        console2.log("\n=== Deployment Summary ===");
        console2.log("ChainId:", block.chainid);
        console2.log("MinimalForwarder:", address(forwarder));
        console2.log("DAOVoting:", address(dao));
        console2.log("Minimum Balance (wei):", minimumBalance);
        console2.log("==========================\n");

        // 7) (Opcional recomendado) Escribir manifiesto JSON para el front
        //_writeManifest(address(forwarder), address(dao), minimumBalance);
    }

    function _writeManifest(
        address forwarder,
        address dao,
        uint256 minimumBalance
    ) internal {
        string memory root = "deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "minimalForwarder", forwarder);
        vm.serializeAddress(root, "daoVoting", dao);
        vm.serializeUint(root, "minimumBalanceWei", minimumBalance);
        vm.serializeUint(root, "timestamp", block.timestamp);

        // Construir el JSON final
        string memory json = vm.serializeString(root, "note", "Foundry deployment manifest");

        // Ruta de salida (ajústala si prefieres otra carpeta)
        string memory outPath = string.concat(
            "out/deployments/DAOVoting-",
            _toString(block.chainid),
            ".json"
        );
        vm.writeFile(outPath, json);
        console2.log("Wrote deployment manifest:", outPath);
    }

    // Utilidad simple para uint->string
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
