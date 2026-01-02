
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title MinimalForwarder2771
 * @notice Forwarder compatible con EIP-2771 para meta-transacciones:
 *         - Verifica firmas off-chain (EIP-712 Typed Data).
 *         - Mantiene nonces por usuario (anti replay).
 *         - Ejecuta llamadas en nombre del usuario original (append sender en calldata).
 * @dev Basado en OpenZeppelin MinimalForwarder, adaptado para EIP-2771 para evitar calcular el Domain Separator cada vez.
 * @dev donde el Domain es un separador de contexto que se mezcla en el hash firmado y sirve para prevenir replays entre redes/contratos/versiones y evita colisiones de hashes.
 */
 
contract MinimalForwarder2771 is EIP712 {
  using Address for address;

  /// @dev Estructura estándar de meta-tx (OpenZeppelin MinimalForwarder style)
  struct ForwardRequest {
    address from;     // usuario original
    address to;       // contrato destino
    uint256 value;    // ETH a enviar junto con la llamada
    uint256 gas;      // gas que se asignará a la ejecución
    uint256 nonce;    // anti replay
    bytes data;       // calldata original
  }

  /// @dev Typehash para EIP-712
  bytes32 private constant _TYPEHASH = keccak256(
    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)"
  );

  /// @dev Nonces por usuario (anti replay)
  mapping(address => uint256) private _nonces;

  /// @notice Constructor: inicializa el dominio EIP-712
  constructor() EIP712("MinimalForwarder", "0.0.1") {}

  /**
   * @notice Devuelve el nonce actual de un usuario.
   * @param user Dirección del usuario.
   */
  function getNonce(address user) external view returns (uint256) {
    return _nonces[user];
  }

  /**
   * @notice Verifica firma y datos de la meta-transacción.
   * @param req Estructura ForwardRequest con los campos de la meta-tx.
   * @param signature Firma ECDSA del usuario sobre el hash EIP-712 del request.
   * @return isValid True si firma y datos son válidos.
   * @dev Exponemos verify(req, signature) para que el relayer pueda validar sin ejecutar.
   */
  function verify(ForwardRequest calldata req, bytes calldata signature) public view returns (bool isValid) {
    // Hash typed data EIP-712: keccak256(abi.encode(TYPEHASH, ... , keccak256(data)))
    bytes32 structHash = keccak256(
      abi.encode(
        _TYPEHASH,
        req.from,
        req.to,
        req.value,
        req.gas,
        req.nonce,
        keccak256(req.data)
      )
    );
    // Calcular digest EIP-712
    bytes32 digest = _hashTypedDataV4(structHash);
    // Recuperar dirección del firmante
    // Normaliza v y verifica s para evitar malleability.
    // Devuelve revert explícito si la firma no es válida.
    address signer = ECDSA.recover(digest, signature);

    // Firma válida + nonce coincide
    isValid = (signer == req.from && _nonces[req.from] == req.nonce);
  }

  /**
   * @notice Ejecuta la meta-transacción si `verify()` pasa.
   * @dev Adjunta `req.from` al final de `calldata` para que ERC2771Context lo recupere como `_msgSender()`.
   *      Incrementa el nonce del usuario y reenvía `value` y `gas` a la llamada.
   * @param req Estructura ForwardRequest.
   * @param signature Firma del usuario.
   * @return success True si la ejecución fue exitosa.
   * @return returndata Bytes de retorno de la llamada.
   */
  function execute(ForwardRequest calldata req, bytes calldata signature)
    external
    payable
    returns (bool success, bytes memory returndata)
  {
    require(verify(req, signature), "MinimalForwarder: invalid meta-tx");

    // Anti replay: incrementar nonce
    _nonces[req.from] = req.nonce + 1;

    // Asegurar fondos si se envía `value`
    if (req.value > 0) {
      require(address(this).balance >= req.value, "MinimalForwarder: insufficient balance");
    }

    // Llamada al destino con `gas` y `value` y `data` + sender (EIP-2771)
    bytes memory callData = abi.encodePacked(req.data, req.from);

    // Ejecutar call
    (success, returndata) = req.to.call{gas: req.gas, value: req.value}(callData);

    // Si la llamada revertió, propaga el error
    if (!success) {
      // bubble up revert reason
      assembly {
        revert(add(returndata, 32), mload(returndata))
      }
    }

    // Nota: si el destino consume más gas del indicado, la llamada fallará.
    // El relayer decide `gas`/`value` y cubre el costo de la transacción (gasless UX).
  }

  /// @notice Permite fondear el forwarder (por ejemplo, para reenviar `value` junto con llamadas)
  receive() external payable {}
}
