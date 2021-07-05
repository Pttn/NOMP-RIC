var crypto = require('crypto');
var base58 = require('base58-native');

exports.addressFromEx = function(exAddress, ripdm160Key) {
	try {
		var versionByte = exports.getVersionByte(exAddress);
		var addrBase = Buffer.concat([versionByte, Buffer.from(ripdm160Key, 'hex')]);
		var checksum = exports.sha256d(addrBase).slice(0, 4);
		var address = Buffer.concat([addrBase, checksum]);
		return base58.encode(address);
	}
	catch(e) {
		return null;
	}
};

exports.getVersionByte = function(addr) {
	var versionByte = base58.decode(addr).slice(0, 1);
	return versionByte;
};
exports.sha256 = function(buffer) {
	var hash1 = crypto.createHash('sha256');
	hash1.update(buffer);
	return hash1.digest();
};
exports.sha256d = function(buffer) {return exports.sha256(exports.sha256(buffer));};
exports.reverseBuffer = function(buff){
	var reversed = Buffer.alloc(buff.length);
	for (var i = buff.length - 1; i >= 0; i--)
		reversed[buff.length - i - 1] = buff[i];
	return reversed;
};
exports.reverseHex = function(hex) {return exports.reverseBuffer(Buffer.from(hex, 'hex')).toString('hex');};
exports.reverseByteOrder = function(buff) {
	for (var i = 0; i < 8; i++) buff.writeUInt32LE(buff.readUInt32BE(i*4), i*4);
	return exports.reverseBuffer(buff);
};
exports.uint256BufferFromHash = function(hex) {
	var fromHex = Buffer.from(hex, 'hex');
	if (fromHex.length != 32){
		var empty = Buffer.alloc(32);
		empty.fill(0);
		fromHex.copy(empty);
		fromHex = empty;
	}
	return exports.reverseBuffer(fromHex);
};
exports.hexFromReversedBuffer = function(buffer){return exports.reverseBuffer(buffer).toString('hex');};

// Defined in bitcoin protocol here: https://en.bitcoin.it/wiki/Protocol_specification#Variable_length_integer
exports.varIntBuffer = function(n) {
	if (n < 0xfd)
		return Buffer.from([n]);
	else if (n <= 0xffff) {
		var buff = Buffer.alloc(3);
		buff[0] = 0xfd;
		buff.writeUInt16LE(n, 1);
		return buff;
	}
	else if (n <= 0xffffffff) {
		var buff = Buffer.alloc(5);
		buff[0] = 0xfe;
		buff.writeUInt32LE(n, 1);
		return buff;
	}
	else {
		var buff = Buffer.alloc(9);
		buff[0] = 0xff;
		exports.packUInt16LE(n).copy(buff, 1);
		return buff;
	}
};

exports.varStringBuffer = function(string) {
	var strBuff = Buffer.from(string);
	return Buffer.concat([exports.varIntBuffer(strBuff.length), strBuff]);
};

/* "serialized CScript" formatting as defined here: https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki#specification
Used to format height and date when putting into script signature: https://en.bitcoin.it/wiki/Script */
exports.serializeNumber = function(n) {
	if (n >= 1 && n <= 16) return Buffer.from([0x50 + n]);
	var l = 1;
	var buff = Buffer.alloc(9);
	while (n > 0x7f) {
		buff.writeUInt8(n & 0xff, l++);
		n >>= 8;
	}
	buff.writeUInt8(l, 0);
	buff.writeUInt8(n, l++);
	return buff.slice(0, l);
};

exports.serializeString = function(s) { // Used for serializing strings used in script signature
	if (s.length < 253)
		return Buffer.concat([Buffer.from([s.length]), Buffer.from(s)]);
	else if (s.length < 0x10000)
		return Buffer.concat([Buffer.from([253]), exports.packUInt16LE(s.length), Buffer.from(s)]);
	else if (s.length < 0x100000000)
		return Buffer.concat([Buffer.from([254]), exports.packUInt32LE(s.length), Buffer.from(s)]);
	else
		return Buffer.concat([Buffer.from([255]), exports.packUInt16LE(s.length), Buffer.from(s)]);
};

exports.packUInt16LE = function(num) {
	var buff = Buffer.alloc(2);
	buff.writeUInt16LE(num, 0);
	return buff;
};
exports.packInt32LE = function(num) {
	var buff = Buffer.alloc(4);
	buff.writeInt32LE(num, 0);
	return buff;
};
exports.packInt32BE = function(num) {
	var buff = Buffer.alloc(4);
	buff.writeInt32BE(num, 0);
	return buff;
};
exports.packUInt32LE = function(num) {
	var buff = Buffer.alloc(4);
	buff.writeUInt32LE(num, 0);
	return buff;
};
exports.packUInt32BE = function(num) {
	var buff = Buffer.alloc(4);
	buff.writeUInt32BE(num, 0);
	return buff;
};
exports.packInt64LE = function(num) {
	var buff = Buffer.alloc(8);
	buff.writeUInt32LE(num % Math.pow(2, 32), 0);
	buff.writeUInt32LE(Math.floor(num/Math.pow(2, 32)), 4);
	return buff;
};

// An exact copy of python's range feature. Written by Tadeck: http://stackoverflow.com/a/8273091
exports.range = function(start, stop, step) {
	if (typeof stop === 'undefined') {
		stop = start;
		start = 0;
	}
	if (typeof step === 'undefined')
		step = 1;
	if ((step > 0 && start >= stop) || (step < 0 && start <= stop))
		return [];
	var result = [];
	for (var i = start; step > 0 ? i < stop : i > stop; i += step)
		result.push(i);
	return result;
};

exports.miningKeyToScript = function(key) {
	var keyBuffer = Buffer.from(key, 'hex');
	return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), keyBuffer, Buffer.from([0x88, 0xac])]);
};

// Used to format wallet address for use in generation transaction's output
exports.addressToScript = function(addr) {
	var decoded = base58.decode(addr);
	if (decoded.length != 25) {
		console.error('invalid address length for ' + addr);
		throw new Error();
	}
	if (!decoded) {
		console.error('base58 decode failed for ' + addr);
		throw new Error();
	}
	var pubkey = decoded.slice(1, -4);
	return Buffer.concat([Buffer.from([0x76, 0xa9, 0x14]), pubkey, Buffer.from([0x88, 0xac])]);
};
