# Aprendizajes Clave del Proyecto Blockchain

Este documento resume los conocimientos adquiridos durante el desarrollo del segundo proyecto blockchain Dao basado en los contratos **DAOVoting2771.sol** y **MinimalForwarder.sol**. Incluye conceptos fundamentales, buenas prácticas y detalles técnicos relevantes.


1) Por qué hereda el contrato **MinimalForwader** de EIP‑712?.
 EIP‑712 es el estándar para firmar datos estructurados, usado aquí para validar la firma del usuario sobre la transacción. EIP‑2771 define cómo pasar la dirección del remitente original al contrato destino, agregándola al final del calldata, en otras palabras define cómo construir el hash que el usuario firma (incluye un domain separator y la estructura tipada).

2) Por qué se usa un Nonce?
El nonce es anti-replay por usuario, cada vez que se ejecuta un request válido, el contrato incrementa el nonce: _nonces[req.from] = req.nonce + 1, en verify(), además de validar la firma, se comprueba que el nonce enviado coincide con el actual: _nonces[req.from] == req.nonce, Esto garantiza que la misma firma no pueda reutilizarse para ejecutar de nuevo (evita que alguien repita la transacción con el mismo payload). El nonce puede interpretarse como un contador de secuencia por usuario.

3) Dinamica del From y el to en Forwader
req.from: el usuario original que firmó la meta-transacción (el “verdadero msg.sender” lógico).
req.to: el contrato destino donde se quiere ejecutar la llamada (por ejemplo, tu contrato de la DAO).
El forwader: 
Valida que req.from efectivamente firmó ese digest (EIP-712) y que el nonce coincide.
Reenvía la llamada a req.to, adjuntando req.from al final del calldata

Ejemplo: 
bytes memory callData = abi.encodePacked(req.data, req.from);
(success, returndata) = req.to.call{gas: req.gas, value: req.value}(callData);

Los contratos destino compatibles con EIP-2771 (por ejemplo, los que heredan de ERC2771Context) saben leer ese sender “pegado” al final del calldata y reportan _msgSender() = req.from (en vez de address(this) o el relayer).


