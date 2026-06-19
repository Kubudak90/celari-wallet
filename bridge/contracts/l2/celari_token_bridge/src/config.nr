use aztec::protocol::{
    address::{AztecAddress, EthAddress},
    traits::{Deserialize, Packable, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    pub token: AztecAddress,
    // The single canonical L1 ERC-20 this bridge is bound to. The caller-supplied
    // `l1_token` on every claim/exit is asserted against this, so a withdraw
    // message can only ever name the L1 token that matches the L2 asset burned.
    pub l1_token: EthAddress,
    pub portal: EthAddress,
}
