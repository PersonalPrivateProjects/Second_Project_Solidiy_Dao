
# **Guía de Deployment - DAO Voting Platform**

Esta guía te ayudará a desplegar la plataforma DAO Voting en tu entorno local paso a paso.

---

## ✅ **1. Iniciar la red local**

Abre una terminal y ejecuta **Anvil** (incluido en Foundry):

```bash
anvil
```

Esto iniciará una blockchain local en `http://127.0.0.1:8545` con **10 cuentas precargadas con 10,000 ETH**.

> **Tip:** Copia la **private key** de la primera cuenta que muestra Anvil. La usaremos para el deployment.

---

## ✅ **2. Configurar variables de entorno para los contratos**

En la carpeta de contratos (`sc`):

```bash
cd sc
cp .env.example .env
```

Edita el archivo `.env` con:

```env
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RPC_URL=http://127.0.0.1:8545
MINIMUM_BALANCE=100000000000000000
```

> La clave privada anterior corresponde a la primera cuenta por defecto de Anvil.

---

## ✅ **3. Compilar, testear y desplegar contratos**

```bash
cd sc

# Compilar contratos
forge build

# Ejecutar tests
forge test

# Deploy
forge script script/Deploy.s.sol:DeployScript   --rpc-url http://127.0.0.1:8545   --broadcast   --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Al finalizar, verás algo como:

```
MinimalForwarder deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
DAOVoting deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

> **Guarda estas direcciones**, las necesitarás para la configuración del front-end.

---

## ✅ **4. Configurar la aplicación web**

En la carpeta `webapp`:

```bash
cd ../webapp
cp .env.example .env.local
```

Edita `.env.local` con las direcciones obtenidas:

```env
NEXT_PUBLIC_DAO_CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
NEXT_PUBLIC_FORWARDER_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RELAYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

RPC_URL=http://127.0.0.1:8545
```

---

## ✅ **5. Generar ABIs para la web**

Desde la carpeta `sc`:

```bash
cd ../sc
jq -r '.abi' out/DAOVoting.sol/DAOVoting2771.json > ../webapp/src/lib/DAOVoting.abi.json
jq -r '.abi' out/MinimalForwarder.sol/MinimalForwarder2771.json > ../webapp/src/lib/MinimalForwarder.abi.json
```

---

## ✅ **6. Iniciar la aplicación web**

```bash
cd ../webapp
npm install
npm run dev
```

La app estará disponible en:  
**`http://localhost:3000`**

---

## ✅ **7. Configurar MetaMask**

1. Abre MetaMask → **Settings → Networks → Add Network**
2. Configura:
   - **Network Name**: Localhost
   - **RPC URL**: http://127.0.0.1:8545
   - **Chain ID**: 31337
   - **Currency Symbol**: ETH
3. Importa una cuenta de Anvil:
   - Click en el icono de cuenta → **Import Account**
   - Pega una private key distinta a la del relayer (ejemplo: segunda cuenta de Anvil):
     ```
     0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
     ```

---

## ✅ **8. Usar la aplicación**

- **Conectar wallet**: Click en "Connect Wallet"
- **Depositar al DAO**: Al menos 0.1 ETH para poder votar
- **Fondear el DAO**: El contrato necesita fondos para propuestas
- **Crear propuesta**:
  - Requiere al menos 10% del balance del contrato
  - Ingresa recipient, amount, duration, description
  - ¡Votación gasless!
- **Votar**: El relayer paga el gas
- **Ejecución automática**: El daemon ejecuta propuestas aprobadas
