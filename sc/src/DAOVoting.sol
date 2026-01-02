
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import { ERC2771Context } from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DAOVoting2771
 * @notice DAO con sistema de propuestas y votación, compatible con meta-transacciones (EIP-2771).
 * @dev Hereda ERC2771Context; usar `_msgSender()` en lugar de `msg.sender` para que el usuario original
 *      (quien firma off-chain) quede reflejado aunque la tx la envíe el forwarder.
 */
contract DAOVoting2771 is ERC2771Context, ReentrancyGuard {
  /// @dev Tipos de voto (orden igual al ejemplo del profesor)
  enum VoteType { ABSTAIN, FOR, AGAINST }

  /// @dev Propuesta
  struct Proposal {
    uint256 id;               // ID secuencial
    address recipient;        // beneficiario
    uint256 amount;           // monto a transferir (wei)
    uint256 votingDeadline;   // fecha límite para votar (timestamp)
    uint256 executionDelay;   // fecha desde la que puede ejecutarse (votingDeadline + EXECUTION_DELAY)
    bool executed;            // si ya se ejecutó
    uint256 forVotes;         // votos a favor
    uint256 againstVotes;     // votos en contra
    uint256 abstainVotes;     // abstenciones
    string description;       // descripción de la propuesta
  }

  // ===== Constantes solicitadas =====
  uint256 public constant PROPOSAL_CREATION_THRESHOLD = 10; // 10% del balance total del DAO
  uint256 public constant EXECUTION_DELAY = 1 days;         // período adicional de seguridad

  // ===== Estado =====
  uint256 public nextProposalId;
  uint256 public minimumBalance;            // balance mínimo para poder votar (aportado al DAO)
  uint256 private _daoBalance;              // balance total aportado (tracking contable)

  mapping(uint256 => Proposal) private _proposals;
  mapping(uint256 => mapping(address => bool)) private _hasVoted;
  mapping(uint256 => mapping(address => VoteType)) private _voteOf;

  mapping(address => uint256) private _contributionOf;      // aportes por usuario

  // ===== Eventos =====
  event Funded(address indexed from, uint256 amount, uint256 totalBalance);
  event ProposalCreated(
    uint256 indexed proposalId,
    address indexed creator,
    address indexed recipient,
    uint256 amount,
    uint256 votingDeadline,
    uint256 executionDelay,
    string description
  );
  event VoteCast(uint256 indexed proposalId, address indexed voter, VoteType voteType);
  event VoteChanged(uint256 indexed proposalId, address indexed voter, VoteType oldVote, VoteType newVote);
  event ProposalExecuted(uint256 indexed proposalId, address indexed recipient, uint256 amount);

  /**
   * @notice Constructor
   * @param trustedForwarder Dirección del forwarder EIP-2771 (MinimalForwarder).
   * @param _minimumBalance Balance mínimo (en wei) requerido para poder votar.
   */
  constructor(address trustedForwarder, uint256 _minimumBalance)
    ERC2771Context(trustedForwarder)
  {
    require(trustedForwarder != address(0), "DAO: invalid forwarder");
    minimumBalance = _minimumBalance;
  }

  // ===== Gestión de fondos (payable) =====

  /**
   * @notice Aportar fondos al DAO (ETH).
   * @dev Usa `_msgSender()` para que cuente el aporte del usuario original en meta-transacciones.
   */
  function fundDAO() external payable nonReentrant {
    require(msg.value > 0, "DAO: zero amount");
    address sender = _msgSender();
    _contributionOf[sender] += msg.value;
    _daoBalance += msg.value;
    emit Funded(sender, msg.value, _daoBalance);
  }

  /**
   * @notice Obtener el balance interno (aportado) de un usuario.
   * @param user Dirección del usuario.
   * @return balance Balance aportado (wei).
   */
  function getUserBalance(address user) external view returns (uint256 balance) {
    balance = _contributionOf[user];
  }

  /**
   * @notice Balance contable total aportado al DAO (tracking).
   * @return total Balance del DAO (wei) según aportes contabilizados.
   */
  function getTotalDeposited() external view returns (uint256 total) {
    total = _daoBalance;
  }

  /**
   * @notice Balance ETH real del contrato (tesorería on-chain).
   * @return bal Balance del contrato en wei.
   */
  function getContractBalance() external view returns (uint256 bal) {
    bal = address(this).balance;
  }

  // ===== Propuestas =====

  /**
   * @notice Crear una nueva propuesta.
   * @param recipient Beneficiario que recibirá los fondos si la propuesta se aprueba.
   * @param amount Monto de ETH (wei) a transferir si se aprueba.
   * @param votingDuration Duración de la votación (segundos) desde `now`.
   * @param description Texto descriptivo de la propuesta.
   * @dev Requiere que el creador tenga >= 10% del balance total del DAO (tracking por `_daoBalance`).
   *      Requiere que el DAO tenga fondos suficientes on-chain (`address(this).balance`) para cubrir `amount`.
   */
  function createProposal(
    address recipient,
    uint256 amount,
    uint256 votingDuration,
    string calldata description
  ) external returns (uint256 proposalId) {
    address creator = _msgSender();

    require(recipient != address(0), "DAO: invalid recipient");
    require(amount > 0, "DAO: amount must be > 0");
    require(votingDuration > 0, "DAO: votingDuration must be > 0");

    // Threshold del 10% sobre el balance contable del DAO
    require(_daoBalance > 0, "DAO: empty treasury");
    uint256 required = (_daoBalance * PROPOSAL_CREATION_THRESHOLD) / 100;
    require(_contributionOf[creator] >= required, "DAO: need >=10% of DAO balance");

    // Verifica que haya fondos on-chain suficientes para ejecutar si se aprueba
    require(amount <= address(this).balance, "DAO: insufficient on-chain balance");

    proposalId = ++nextProposalId;

    uint256 votingDeadline = block.timestamp + votingDuration;
    uint256 executionDelay = votingDeadline + EXECUTION_DELAY;

    _proposals[proposalId] = Proposal({
      id: proposalId,
      recipient: recipient,
      amount: amount,
      votingDeadline: votingDeadline,
      executionDelay: executionDelay,
      executed: false,
      forVotes: 0,
      againstVotes: 0,
      abstainVotes: 0,
      description: description
    });

    emit ProposalCreated(
      proposalId,
      creator,
      recipient,
      amount,
      votingDeadline,
      executionDelay,
      description
    );

    return proposalId;
  }

  /**
   * @notice Obtener una propuesta completa por ID.
   * @param proposalId ID de la propuesta.
   * @return p La estructura `Proposal`.
   */
  function getProposal(uint256 proposalId) external view returns (Proposal memory p) {
    p = _proposals[proposalId];
    require(p.id != 0, "DAO: proposal not found");
  }

  // ===== Votación =====

  /**
   * @notice Votar una propuesta (ABSTAIN, FOR, AGAINST). Se puede cambiar voto antes del `votingDeadline`.
   * @param proposalId ID de la propuesta.
   * @param voteType Tipo de voto.
   * @dev Requiere balance mínimo (`minimumBalance`) y que la propuesta no esté ejecutada.
   */
  function vote(uint256 proposalId, VoteType voteType) external {
    Proposal storage p = _proposals[proposalId];
    require(p.id != 0, "DAO: proposal not found");
    require(block.timestamp < p.votingDeadline, "DAO: voting closed");
    require(!p.executed, "DAO: already executed");

    address voter = _msgSender();
    require(_contributionOf[voter] >= minimumBalance, "DAO: insufficient voting balance");

    if (_hasVoted[proposalId][voter]) {
      // Cambiar voto: ajusta contadores
      VoteType old = _voteOf[proposalId][voter];
      if (old == VoteType.FOR)        { p.forVotes      -= 1; }
      else if (old == VoteType.AGAINST){ p.againstVotes  -= 1; }
      else                             { p.abstainVotes  -= 1; }

      _voteOf[proposalId][voter] = voteType;

      if (voteType == VoteType.FOR)        { p.forVotes      += 1; }
      else if (voteType == VoteType.AGAINST){ p.againstVotes  += 1; }
      else                                  { p.abstainVotes  += 1; }

      emit VoteChanged(proposalId, voter, old, voteType);
    } else {
      _hasVoted[proposalId][voter] = true;
      _voteOf[proposalId][voter]   = voteType;

      if (voteType == VoteType.FOR)        { p.forVotes      += 1; }
      else if (voteType == VoteType.AGAINST){ p.againstVotes  += 1; }
      else                                  { p.abstainVotes  += 1; }

      emit VoteCast(proposalId, voter, voteType);
    }
  }

  /**
   * @notice Consultar el voto de un usuario en una propuesta.
   * @param proposalId ID de la propuesta.
   * @param user Dirección del usuario.
   * @return v Tipo de voto registrado.
   */
  function getUserVote(uint256 proposalId, address user) external view returns (VoteType v) {
    require(_proposals[proposalId].id != 0, "DAO: proposal not found");
    v = _voteOf[proposalId][user];
  }

  // ===== Ejecución =====

  /**
   * @notice Ejecutar una propuesta aprobada.
   * @param proposalId ID de la propuesta.
   * @dev Requiere: votingDeadline pasado + EXECUTION_DELAY, no ejecutada,
   *      `forVotes > againstVotes`, y balance on-chain suficiente.
   *      Transfiere `amount` al `recipient`.
   */
  function executeProposal(uint256 proposalId) external nonReentrant {
    Proposal storage p = _proposals[proposalId];
    require(p.id != 0, "DAO: proposal not found");
    require(!p.executed, "DAO: already executed");
    require(block.timestamp >= p.votingDeadline, "DAO: voting not ended");
    require(block.timestamp >= p.executionDelay, "DAO: execution delay not passed");
    require(p.forVotes > p.againstVotes, "DAO: not approved");
    require(p.amount <= address(this).balance, "DAO: insufficient on-chain balance");

    (bool ok, ) = p.recipient.call{ value: p.amount }("");
    require(ok, "DAO: transfer failed");

    p.executed = true;

    // Si llevas contabilidad estilo “totalDeposited” y deseas descontar al ejecutar:
    // _daoBalance = (_daoBalance >= p.amount) ? (_daoBalance - p.amount) : 0;

    emit ProposalExecuted(p.id, p.recipient, p.amount);
  }



 
// ===== Soporte ERC2771Context =====

/**
 * @dev `_msgSender()` y `_msgData()` delegan en ERC2771Context para soportar meta-transacciones.
 * - `_msgSender()` retorna el firmante original (no el forwarder).
 * - `_msgData()` retorna el payload original, excluyendo el sufijo que añade el forwarder.
 */
function _msgSender() internal view override(ERC2771Context) returns (address sender) {
    sender = ERC2771Context._msgSender();
}

function _msgData() internal view override(ERC2771Context) returns (bytes calldata) {
    return ERC2771Context._msgData();
}

/**
 * @dev `_contextSuffixLength()` informa cuántos bytes al final de `msg.data` pertenecen al
 * contexto añadido por el forwarder EIP-2771. OpenZeppelin establece 20 bytes (una dirección)
 * en `ERC2771Context`. Este override no cambia el funcionamiento, pero:
 *  - documenta explícitamente que el contrato opera con un sufijo de 20 bytes (meta-tx),
 *  - ayuda a resolver el orden de herencia si en el futuro se combinan otras extensiones
 *    que también modifiquen `_msgData()` o dependan del largo del sufijo.
 */
function _contextSuffixLength()
    internal
    view
    override(ERC2771Context)
    returns (uint256)
{
    return ERC2771Context._contextSuffixLength(); // 20 bytes (address del signer original)
}


/**
 * @dev Recibe ETH sin datos. Intencionalmente NO contabiliza aportes individuales:
 * - En meta-transacciones (EIP-2771) no hay `calldata` aquí, por lo que no se puede
 *   reconstruir el firmante original con `_msgSender()`.
 * - La contabilidad con identidad se hace en `fundDAO()` (payable) usando `_msgSender()`.
 * - Este `receive()` solo incrementa la tesorería real (`address(this).balance`),
 *   útil para reembolsos, envíos directos, `selfdestruct`, etc.
 */
 /*
receive() external payable {}
*/

}
