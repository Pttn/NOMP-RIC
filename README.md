# Node Open Mining Portal for Riecoin (NOMP-RIC)

This is a fork of [zone117x/node-open-mining-portal](https://github.com/zone117x/node-open-mining-portal), adapted to support the latest Riecoin Core versions (including Testnet network). It can either be used as a base to create new Riecoin NOMP pools, or to update current ones by porting changes from this repository.

A fork of [zone117x/node-stratum-pool](https://github.com/zone117x/node-stratum-pool) adapted for Riecoin is also included in this repository (rather than being in another GitHub repository), as well as a stripped down version of [zone117x/node-multi-hashing](https://github.com/zone117x/node-multi-hashing).

You might want to read the READMEs of the original repositories in addition to this one. NOMP-RIC has been cleaned up (in particular, the coin switching feature and all the other coins were removed), though it should be easy to restore or add any feature or another coin if needed.

If you have trouble using this software, you can always ask a Riecoin Pool Operator in [Discord](https://discord.gg/2sJEayC), they will be glad to help you. However, you are also expected to have decent abilities and to be autonomous; if you cannot follow the instructions below or get stuck every time an error message appear, then you are certainly not ready to operate a pool.

## Instructions

### Configure Riecoin Core

First, configure Riecoin Core using the `riecoin.conf` file. Here is a basic template:

```
daemon=1
server=1
rpcuser=(choose an username)
rpcpassword=(choose a password)

[main]
rpcport=28332
port=28333
rpcbind=127.0.0.1

[test]
rpcport=38332
port=38333
rpcbind=127.0.0.1
```

You will need an address (block rewards will be sent there before being redistributed to miners) for each pool. And of course, the synchronization must be done, etc. The pool's payment processor may also require a fallback fee (especially for Testnet), in this case start using for example `-fallbackfee=0.0001`.

Once you are ready, start Riecoin Core.

### Dependencies

NOMP-RIC uses [Node Js](https://nodejs.org/) and requires [Redis](https://redis.io/), as well as [GMP](https://gmplib.org/). On Debian based systems, you can install them if needed with

```
apt install npm redis libgmp-dev
```

You should be able to figure out any remaining dependency if needed.

Later, if you have Redis errors, you might have to start it manually with

```
redis-server
```

### Configure and start NOMP-RIC

Then, you can get the source code and update the Node Modules with Npm.

```
git clone https://github.com/Pttn/NOMP-RIC.git
cd NOMP-RIC
npm update
```

Configure your Riecoin pools by editing the sample files in `pool_configs`, which contain comments explaining the options; in particular, change the addresses, RPC username and password. It is also possible to disable a pool by setting `enabled` to false, for example if you don't want the Testnet pool.

You are now ready to start your pool(s) with

```
node init.js
```

A web interface is accessible at `0.0.0.0:8000` (just open this in a web browser). It is minimalist, but it is now your job to fill and revamp it to make it look the way you want. Please just don't follow the trend of bloated pages and requiring tons of cookies...
