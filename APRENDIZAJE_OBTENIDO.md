# 📚 Aprendizajes Clave del Proyecto Blockchain

Este documento resume los conocimientos adquiridos durante el desarrollo del segundo proyecto blockchain **DAO** basado en los contratos **DAOVoting2771.sol** y **MinimalForwarder2771.sol**. Incluye conceptos fundamentales, buenas prácticas y detalles técnicos relevantes.

---

## 1. ¿Por qué el contrato **MinimalForwarder** hereda de EIP‑712?

- **EIP‑712** es el estándar para firmar datos estructurados, usado aquí para validar la firma del usuario sobre la meta-transacción.
- **EIP‑2771** define cómo pasar la dirección del remitente original al contrato destino, agregándola al final del `calldata`.
- El contrato hereda de `EIP712` para:
  - Construir el **hash firmado** por el usuario.
  - Incluir el **domain separator** (previene replays entre redes/contratos/versiones).
  - Evitar colisiones en los hashes.

---

## 2. ¿Por qué se usa un **Nonce**?

- El **nonce** es un mecanismo **anti-replay** por usuario.
- Cada vez que se ejecuta un request válido, el contrato incrementa el nonce:
  ```solidity
  _nonces[req.from] = req.nonce + 1;
  ```
- En `verify()`, además de validar la firma, se comprueba que el nonce enviado coincide con el actual:
  ```solidity
  _nonces[req.from] == req.nonce;
  ```
- Esto garantiza que la misma firma no pueda reutilizarse para ejecutar la transacción de nuevo.
- **Interpretación**: El nonce actúa como un **contador de secuencia por usuario**.

---

## 3. Dinámica de `from` y `to` en el Forwarder

- `req.from`: el **usuario original** que firmó la meta-transacción (el “verdadero `msg.sender`” lógico).
- `req.to`: el **contrato destino** donde se quiere ejecutar la llamada (por ejemplo, el contrato DAO).

**Flujo del Forwarder:**
1. Valida que `req.from` efectivamente firmó el digest (EIP‑712) y que el nonce coincide.
2. Reenvía la llamada a `req.to`, **adjuntando `req.from` al final del calldata**:
   ```solidity
   bytes memory callData = abi.encodePacked(req.data, req.from);
   (success, returndata) = req.to.call{gas: req.gas, value: req.value}(callData);
   ```
3. Los contratos destino compatibles con **EIP‑2771** (por ejemplo, los que heredan de `ERC2771Context`) leen ese sender “pegado” y reportan:
   ```solidity
   _msgSender() == req.from;
   ```
   en lugar de `msg.sender` (que sería el forwarder).

---

## 4. ¿Cómo funciona la firma EIP‑712 y el **Domain Separator**?

Cuando firmas Typed Data (EIP‑712), el **digest** que se firma mezcla:
- **Domain** (contexto).
- **Struct** (los datos: `ForwardRequest`).

El **Domain** incluye:
- `name` → Nombre lógico del forwarder.
- `version` → Versión lógica del contrato (no es la versión de Solidity).
- `chainId` → Identificador de la red (previene replays entre redes).
- `verifyingContract` → Dirección del forwarder.

Ejemplo en el contrato:
```solidity
constructor() EIP712("MinimalForwarder", "0.0.1") {}
```

**Reglas:**
- El `chainId` del front debe coincidir con el de la red donde corre el forwarder.
- `name` y `version` deben coincidir exactamente con los usados en el constructor `EIP712(...)`.
- Cambiar `name` o `version` invalida firmas anteriores (útil para upgrades).

---

## 5. Pago del Gas con Relayer (EOA)

- El **gas** lo paga una **cuenta externa (EOA)** controlada por una clave privada (por ejemplo, MetaMask).
- Esta cuenta puede ser:
  - La misma que desplegó el forwarder.
  - Otra cuenta dedicada como relayer.
- Si se agota el saldo, se puede recargar o cambiar la cuenta relayer.

**Importante:**
- Un contrato **NO puede usar su saldo para pagar gas**, porque:
  - El gas se cobra **antes** de ejecutar cualquier código.
  - Los contratos no pueden iniciar transacciones por sí mismos, solo responder.

**Diferencia clave:**
- `address(this).balance` → ETH del forwarder, usado para reenviar `req.value` al destino.
- `relayer.balance` → ETH del EOA relayer, usado para pagar **gas**.

---

## 6. Conceptos Clave

- **On-chain**: Todo lo que ocurre dentro de la blockchain (contratos, estados, transacciones).
- **EOA (Externally Owned Account)**: Cuenta externa controlada por clave privada, capaz de iniciar transacciones y pagar gas.

---

### ✅ Buenas prácticas adicionales
- Usar `_msgSender()` y `_msgData()` en contratos destino para compatibilidad con EIP‑2771.
- Monitorear:
  - Balance del forwarder (`address(this).balance`) → para reenviar `value`.
  - Balance del relayer (EOA) → para pagar gas.
- Implementar funciones en el forwarder para:
  ```solidity
  function getForwarderBalance() external view returns (uint256) {
      return address(this).balance;
  }
  function getBalanceOf(address addr) external view returns (uint256) {
      return addr.balance;
  }
  ```
- Agregar `receive()` y `fallback()` para aceptar ETH:
  ```solidity
  receive() external payable {}
  fallback() external payable {}
  ```

---
