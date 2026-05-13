import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/types"
import "@wrappers/OnchainRenderer.gen"

fun main() {
    val deployer = scripts.wallet("deployer");

    val contract = OnchainRenderer.fromStorage(Storage.default(deployer.address));
    val res = contract.deploy(deployer.address, { value: ton("0.05") });
    if (res.waitForFirstTransaction() == null) {
        return;
    }

    val (
        width,
        height,
        _,
        _,
        _,
        _,
    ) = contract.config();
    println("Deployed OnchainRenderer to {}", contract.address);
    println("Canvas: {}x{}", width, height);
}
