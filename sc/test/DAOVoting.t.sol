
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import {DAOVoting2771} from "../src/DAOVoting.sol";
import {MinimalForwarder2771} from "../src/MinimalForwarder.sol";

/**
 * @dev Suite de pruebas centrado en el flujo del DAO y el uso del MinimalForwarder2771 real.
 * - Firma ForwardRequest con EIP-712 y ejecuta meta-transacciones (gasless).
 * - Verifica comportamiento de creación, voto y ejecución de propuestas, y depósitos.
 */
contract DAOVotingForwarderTest is Test {
    // Llaves/actores
    uint256 internal alicePk = 0xA11CE;
    uint256 internal bobPk   = 0xB0B;
    uint256 internal carolPk = 0xC0C;

    address internal alice = vm.addr(alicePk);
    address internal bob   = vm.addr(bobPk);
    address internal carol = vm.addr(carolPk);
    address internal relayer; // EOA que envía la tx del forwarder

    // SUT
    MinimalForwarder2771 internal forwarder;
    DAOVoting2771 internal dao;

    // Configuración DAO
    uint256 internal MIN_BALANCE = 1 ether;

    // Constantes EIP-712 (dominio del forwarder)
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant FORWARDREQUEST_TYPEHASH =
        keccak256("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)");

    // ========= Setup =========
    function setUp() public {
        // Fondos iniciales para actores
        vm.deal(alice, 100 ether);
        vm.deal(bob,   100 ether);
        vm.deal(carol, 100 ether);

        relayer = address(0xFEE1);
        vm.deal(relayer, 10 ether);

        // Desplegar forwarder y DAO
        forwarder = new MinimalForwarder2771();
        dao = new DAOVoting2771(address(forwarder), MIN_BALANCE);

        // Fondear al forwarder para reenviar `value` cuando se use meta-tx con ETH
        vm.deal(address(forwarder), 100 ether);
    }

    // ========= Helpers EIP-712 =========

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("MinimalForwarder")),
                keccak256(bytes("0.0.1")),
                block.chainid,
                address(forwarder)
            )
        );
    }

    function _structHash(MinimalForwarder2771.ForwardRequest memory req) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                FORWARDREQUEST_TYPEHASH,
                req.from,
                req.to,
                req.value,
                req.gas,
                req.nonce,
                keccak256(req.data)
            )
        );
    }

    function _digest(MinimalForwarder2771.ForwardRequest memory req) internal view returns (bytes32) {
        bytes32 ds = _domainSeparator();
        bytes32 sh = _structHash(req);
        return keccak256(abi.encodePacked("\x19\x01", ds, sh));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _executeViaForwarder(
        MinimalForwarder2771.ForwardRequest memory req,
        bytes memory sig
    ) internal returns (bool success, bytes memory returndata) {
        vm.prank(relayer);
        (success, returndata) = forwarder.execute{value: req.value}(req, sig);
        require(success, "forwarder.execute failed");
    }

    // ========= Depositar ==========

    /// @dev testDeposit: depósito vía forwarder usando fundDAO()
    function testDeposit() public {
        uint256 amt = 2 ether;

        MinimalForwarder2771.ForwardRequest memory req;
        req.from  = bob;
        req.to    = address(dao);
        req.value = amt;
        req.gas   = 500_000;
        req.nonce = forwarder.getNonce(bob);
        req.data  = abi.encodeWithSelector(dao.fundDAO.selector);

        bytes32 digest = _digest(req);
        bytes memory sig = _sign(bobPk, digest);

        bool ok = forwarder.verify(req, sig);
        assertTrue(ok, "verify should pass");

        _executeViaForwarder(req, sig);

        assertEq(dao.getUserBalance(bob), amt, "bob balance after deposit");
        assertEq(dao.getTotalDeposited(), amt, "dao tracking after deposit");
        assertEq(dao.getContractBalance(), amt, "contract balance after deposit");
    }

    /// @dev testReceiveEther: sin receive(), enviar ETH “a pelo” debe fallar y no cambiar balance
    function testReceiveEther() public {
        (bool ok, ) = address(dao).call{value: 1 ether}("");
        assertFalse(ok, "plain ETH should be rejected without receive()");
        assertEq(dao.getContractBalance(), 0, "contract balance remains 0");
        assertEq(dao.getTotalDeposited(), 0, "dao tracking remains 0");
    }

    /// @dev testGetBalance: getters consistentes tras depósitos directos (EOA) en fundDAO()
    function testGetBalance() public {
        vm.prank(alice);
        dao.fundDAO{value: 1.5 ether}();

        vm.prank(bob);
        dao.fundDAO{value: 2.0 ether}();

        assertEq(dao.getUserBalance(alice), 1.5 ether, "alice balance");
        assertEq(dao.getUserBalance(bob),   2.0 ether, "bob balance");
        assertEq(dao.getTotalDeposited(),   3.5 ether, "dao tracking");
        assertEq(dao.getContractBalance(),  3.5 ether, "contract real balance");
    }

    // ========= Creación de propuestas ==========

    function testCreateProposalFailsWithInsufficientBalance() public {
        // Treasury: Alice aporta 10 ETH
        vm.prank(alice);
        dao.fundDAO{value: 10 ether}();

        // Bob aporta 0.5 ETH (no alcanza el 10%)
        vm.prank(bob);
        dao.fundDAO{value: 0.5 ether}();

        // Bob intenta crear: debe fallar por umbral de 10%
        vm.prank(bob);
        vm.expectRevert(bytes("DAO: need >=10% of DAO balance"));
        dao.createProposal(carol, 1 ether, 1 days, "Insufficient creator balance");
    }

    function testCreateProposal() public {
        // Aporta suficiente y crea
        vm.prank(alice);
        dao.fundDAO{value: 5 ether}();

        vm.prank(alice);
        uint256 pid = dao.createProposal(carol, 3 ether, 2 days, "Pay Carol");
        assertEq(pid, 1, "first proposal id");

        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        assertEq(p.id, 1, "id");
        assertEq(p.recipient, carol, "recipient");
        assertEq(p.amount, 3 ether, "amount");
        assertEq(p.executed, false, "executed false");
        assertEq(p.forVotes, 0, "forVotes 0");
        assertEq(p.againstVotes, 0, "againstVotes 0");
        assertEq(p.abstainVotes, 0, "abstainVotes 0");
        assertEq(p.description, "Pay Carol", "description");
    }

    // ========= Votación ==========

    function _setupProposalForVoting() internal returns (uint256 pid) {
        // Alice aporta y crea propuesta
        vm.prank(alice);
        dao.fundDAO{value: 5 ether}();

        vm.prank(alice);
        pid = dao.createProposal(carol, 3 ether, 2 days, "Voting proposal");

        // Carol aporta >= MIN_BALANCE para poder votar
        vm.prank(carol);
        dao.fundDAO{value: 2 ether}();
    }

    function testVoteFailsWithInsufficientBalance() public {
        uint256 pid = _setupProposalForVoting();

        // Bob aporta menos del mínimo
        vm.prank(bob);
        dao.fundDAO{value: 0.5 ether}();

        vm.prank(bob);
        vm.expectRevert(bytes("DAO: insufficient voting balance"));
        dao.vote(pid, DAOVoting2771.VoteType.FOR);
    }

    function testVoteFailsAfterDeadline() public {
        uint256 pid = _setupProposalForVoting();

        // Avanza más allá del deadline
        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        vm.warp(p.votingDeadline + 1);

        vm.prank(carol);
        vm.expectRevert(bytes("DAO: voting closed"));
        dao.vote(pid, DAOVoting2771.VoteType.FOR);
    }

    function testVoteFor() public {
        uint256 pid = _setupProposalForVoting();

        vm.prank(carol);
        dao.vote(pid, DAOVoting2771.VoteType.FOR);

        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        assertEq(p.forVotes, 1, "forVotes 1");
        assertEq(p.againstVotes, 0, "againstVotes 0");
        assertEq(p.abstainVotes, 0, "abstainVotes 0");
    }

    function testVoteAgainst() public {
        uint256 pid = _setupProposalForVoting();

        vm.prank(carol);
        dao.vote(pid, DAOVoting2771.VoteType.AGAINST);

        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        assertEq(p.forVotes, 0, "forVotes 0");
        assertEq(p.againstVotes, 1, "againstVotes 1");
        assertEq(p.abstainVotes, 0, "abstainVotes 0");
    }

    function testChangeVote() public {
        uint256 pid = _setupProposalForVoting();

        // Vota FOR
        vm.prank(carol);
        dao.vote(pid, DAOVoting2771.VoteType.FOR);

        // Cambia a AGAINST antes del deadline
        vm.prank(carol);
        dao.vote(pid, DAOVoting2771.VoteType.AGAINST);

        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        assertEq(p.forVotes, 0, "forVotes 0 after change");
        assertEq(p.againstVotes, 1, "againstVotes 1 after change");
        assertEq(p.abstainVotes, 0, "abstainVotes 0");
    }

    // ========= Ejecución ==========

    function _setupApprovedProposal() internal returns (uint256 pid) {
        // Alice aporta 5 ETH, crea propuesta de 3 ETH
        vm.prank(alice);
        dao.fundDAO{value: 5 ether}();

        vm.prank(alice);
        pid = dao.createProposal(carol, 3 ether, 1 days, "Exec proposal");

        // Carol aporta y vota FOR
        vm.prank(carol);
        dao.fundDAO{value: 2 ether}();

        vm.prank(carol);
        dao.vote(pid, DAOVoting2771.VoteType.FOR);
    }

    function testExecuteFailsBeforeDeadline() public {
        uint256 pid = _setupApprovedProposal();

        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        // Aún antes del deadline
        vm.warp(p.votingDeadline - 1);

        vm.prank(alice);
        vm.expectRevert(bytes("DAO: voting not ended"));
        dao.executeProposal(pid);
    }

    function testExecuteFailsBeforeExecutionDelay() public {
        uint256 pid = _setupApprovedProposal();

        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        // Después del deadline pero antes del executionDelay
        vm.warp(p.votingDeadline + 1);

        vm.prank(alice);
        vm.expectRevert(bytes("DAO: execution delay not passed"));
        dao.executeProposal(pid);
    }

    function testExecuteFailsWhenNotApproved() public {
        // Setup: propuesta sin FOR mayor a AGAINST
        vm.prank(alice);
        dao.fundDAO{value: 5 ether}();

        vm.prank(alice);
        uint256 pid = dao.createProposal(carol, 3 ether, 1 days, "Not approved");

        // Nadie vota FOR; avanzamos hasta después del execDelay
        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        vm.warp(p.executionDelay);

        vm.prank(alice);
        vm.expectRevert(bytes("DAO: not approved"));
        dao.executeProposal(pid);
    }

    function testExecuteApprovedProposal() public {
        uint256 pid = _setupApprovedProposal();

        // Avanza hasta ejecución permitida
        DAOVoting2771.Proposal memory p = dao.getProposal(pid);
        vm.warp(p.executionDelay);

        uint256 beforeCarol = carol.balance;

        vm.prank(alice); // cualquiera puede ejecutar
        dao.executeProposal(pid);

        uint256 afterCarol = carol.balance;
        assertEq(afterCarol - beforeCarol, 3 ether, "recipient should receive amount");

        DAOVoting2771.Proposal memory p2 = dao.getProposal(pid);
        assertTrue(p2.executed, "proposal should be executed");
    }
}
