# Node Open Mining Portal for Riecoin (NOMP-RIC)

This repository provides code to power a Riecoin Pool. It is based on [zone117x/node-open-mining-portal](https://github.com/zone117x/node-open-mining-portal) and its dependency [zone117x/node-stratum-pool](https://github.com/zone117x/node-stratum-pool), though everything was refactored and simplified to allow better maintenance and improvement of the code. If you need code more similar to the original NOMP, please use the [Legacy](https://github.com/Pttn/NOMP-RIC/tree/Legacy) branch. Also note that not all features from the original code have been ported or tested, though NOMP-RIC should still satisfy the needs of most people. Pull Requests are welcomed if you wish to port or fix something.

If you have trouble using this software, you can always ask in the [Riecoin Forum](https://forum.riecoin.dev/viewforum.php?f=14) and experienced users will be glad to help you. However, you are also expected to have decent abilities and to be autonomous; if you cannot follow the instructions below or get stuck every time an error message appears, then you are certainly not ready to operate a pool.

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

Once you are ready, start Riecoin Core (Mainnet, Testnet, or both, depending on your goal). If needed, create a new wallet and generate an address where block rewards will be sent before being redistributed to miners. Of course, make sure that the synchronization is done.

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
