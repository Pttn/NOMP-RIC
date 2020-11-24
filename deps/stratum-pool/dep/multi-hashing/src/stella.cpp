#include <array>
#include <vector>
#include <gmp.h>
#include <gmpxx.h>
#include <openssl/sha.h>
#include <cassert>
#include "stella.h"

// Essentially adapted code from Riecoin Core and rieMiner

inline std::vector<uint8_t> a8ToV8(const std::array<uint8_t, 32> &a8) {
	return std::vector<uint8_t>(a8.begin(), a8.end());
}

inline std::array<uint8_t, 32> sha256(const uint8_t *data, uint32_t len) {
	std::array<uint8_t, 32> hash;
	SHA256_CTX sha256;
	SHA256_Init(&sha256);
	SHA256_Update(&sha256, data, len);
	SHA256_Final(hash.data(), &sha256);
	return hash;
}
inline std::array<uint8_t, 32> sha256sha256(const uint8_t *data, uint32_t len) {
	return sha256(sha256(data, len).data(), 32);
}

// Bitcoin Core's arith_uint256::SetCompact for UInt64_Ts, pfOverflow set to true if the number is >= 2^64
uint64_t decodeCompact(uint32_t nCompact, bool* pfNegative = nullptr, bool* pfOverflow = nullptr) {
	uint64_t u64;
	int nSize = nCompact >> 24;
	uint32_t nWord = nCompact & 0x007fffff;
	if (nSize <= 3) {
		nWord >>= 8 * (3 - nSize);
		u64 = nWord;
	}
	else {
		u64 = nWord;
		u64 <<= 8 * (nSize - 3);
	}
	if (pfNegative)
		*pfNegative = nWord != 0 && (nCompact & 0x00800000) != 0;
	if (pfOverflow)
		*pfOverflow = nWord != 0 && ((nSize > 10) ||
									 (nWord > 0xff && nSize > 9) ||
									 (nWord > 0xffff && nSize > 8));
	return u64;
}

// Riecoin Block Header structure, total 896 bits/112 bytes (224 hex chars)
struct BlockHeader { // The fields are named according to the GetBlockTemplate labels
	uint32_t version;
	std::array<uint8_t, 32> previousblockhash;
	std::array<uint8_t, 32> merkleRoot;
	uint64_t curtime;
	uint32_t bits;
	std::array<uint8_t, 32> nOffset;
	
	BlockHeader(const uint8_t* buffer) { // First 112 bytes must cointain the raw Block Header data
		version = reinterpret_cast<const uint32_t*>(&buffer[0])[0];
		for (uint32_t i(0) ; i < 32 ; i++) previousblockhash[i] = buffer[4 + i];
		for (uint32_t i(0) ; i < 32 ; i++) merkleRoot[i] = buffer[36 + i];
		curtime = reinterpret_cast<const uint64_t*>(&buffer[68])[0];
		bits = reinterpret_cast<const uint32_t*>(&buffer[76])[0];
		for (uint32_t i(0) ; i < 32 ; i++) nOffset[i] = buffer[80 + i];
	}
	std::vector<uint8_t> toV8() const;
	std::array<uint8_t, 32> powHash(const int32_t) const;
	mpz_class target(const int32_t, uint64_t&) const;
};

double decodeBits(const uint32_t nBits, const int32_t powVersion) {
	if (powVersion == -1) // Doubles are exact up to 2^53 for integers
		return static_cast<double>(decodeCompact(nBits, nullptr, nullptr));
	else if (powVersion == 1)
		return static_cast<double>(nBits)/256.;
	return 1.;
}

std::vector<uint8_t> BlockHeader::toV8() const {
	std::vector<uint8_t> v8;
	for (uint32_t i(0) ; i < 4 ; i++) v8.push_back(reinterpret_cast<const uint8_t*>(&version)[i]);
	v8.insert(v8.end(), previousblockhash.begin(), previousblockhash.end());
	v8.insert(v8.end(), merkleRoot.begin(), merkleRoot.end());
	for (uint32_t i(0) ; i < 8 ; i++) v8.push_back(reinterpret_cast<const uint8_t*>(&curtime)[i]);
	for (uint32_t i(0) ; i < 4 ; i++) v8.push_back(reinterpret_cast<const uint8_t*>(&bits)[i]);
	v8.insert(v8.end(), nOffset.begin(), nOffset.end());
	return v8;
}

std::array<uint8_t, 32> BlockHeader::powHash(const int32_t powVersion) const {
	if (powVersion == -1) { // "Legacy" PoW: the hash is done after swapping nTime and nBits
		std::array<uint8_t, 80> bhForPow;
		*reinterpret_cast<uint32_t*>(&bhForPow) = version;
		std::copy(previousblockhash.begin(), previousblockhash.end(), bhForPow.begin() + 4);
		std::copy(merkleRoot.begin(), merkleRoot.end(), bhForPow.begin() + 36);
		*reinterpret_cast<uint32_t*>(&bhForPow[68]) = bits;
		*reinterpret_cast<uint64_t*>(&bhForPow[72]) = curtime;
		return sha256sha256(bhForPow.data(), 80);
	}
	else
		return sha256sha256(toV8().data(), 80);
}

mpz_class BlockHeader::target(const int32_t powVersion, uint64_t &trailingZeros) const {
	const uint32_t difficultyIntegerPart(decodeBits(bits, powVersion));
	const std::array<uint8_t, 32> hash(powHash(powVersion));
	mpz_class target(0);
	if (powVersion == -1) {
		trailingZeros = difficultyIntegerPart;
		target = 256;
		for (uint64_t i(0) ; i < 256 ; i++) {
			target <<= 1;
			if ((hash[i/8] >> (i % 8)) & 1)
				target.get_mpz_t()->_mp_d[0]++;
		}
	}
	else if (powVersion == 1) {
		trailingZeros = difficultyIntegerPart + 1;
		const uint32_t df(bits & 255U);
		target = 256 + ((10U*df*df*df + 7383U*df*df + 5840720U*df + 3997440U) >> 23U);
		target <<= 256;
		mpz_class hashGmp;
		mpz_import(hashGmp.get_mpz_t(), 32, -1, sizeof(uint8_t), 0, 0, hash.begin());
		target += hashGmp;
	}
	else
		return 0;
	
	if (trailingZeros < 265U) return 0;
	trailingZeros -= 265U;
	target <<= trailingZeros;
	return target;
}

uint32_t CheckConstellation(mpz_class n, std::vector<int32_t> offsets, uint32_t iterations) {
	uint32_t sharePrimeCount(0);
	for (const auto &offset : offsets) {
		n += offset;
		if (mpz_probab_prime_p(n.get_mpz_t(), iterations) != 0)
			sharePrimeCount++;
		else if (sharePrimeCount < 2)
			return 0;
	}
	return sharePrimeCount;
}

static std::vector<uint64_t> GeneratePrimeTable(const uint64_t limit) { // Using Sieve of Eratosthenes
	if (limit < 2) return {};
	std::vector<uint64_t> compositeTable((limit + 127ULL)/128ULL, 0ULL);
	for (uint64_t f(3ULL) ; f*f <= limit ; f += 2ULL) {
		if (compositeTable[f >> 7ULL] & (1ULL << ((f >> 1ULL) & 63ULL))) continue;
		for (uint64_t m((f*f) >> 1ULL) ; m <= (limit >> 1ULL) ; m += f)
			compositeTable[m >> 6ULL] |= 1ULL << (m & 63ULL);
	}
	std::vector<uint64_t> primeTable(1, 2);
	for (uint64_t i(1ULL) ; (i << 1ULL) + 1ULL <= limit ; i++) {
		if (!(compositeTable[i >> 6ULL] & (1ULL << (i & 63ULL))))
			primeTable.push_back((i << 1ULL) + 1ULL);
	}
	return primeTable;
}
const std::vector<uint64_t> primeTable(GeneratePrimeTable(821641)); // Used to calculate the Primorial when checking

int GetSharePrimeCount(const uint8_t *rawBlockHeader, const int32_t powVersion, const std::vector<std::vector<int32_t>>& acceptedPatterns) {
	BlockHeader blockHeader(rawBlockHeader);
	if (powVersion == -1) {
		if ((blockHeader.nOffset[0] & 1) != 1)
			return 0;
		// Reject weird Compacts
		bool fNegative;
		bool fOverflow;
		decodeCompact(blockHeader.bits, &fNegative, &fOverflow);
		if (fNegative || fOverflow)
			return 0;
	}
	else if (powVersion == 1) {
		if (reinterpret_cast<const uint16_t*>(&blockHeader.nOffset[0])[0] != 2)
			return 0;
	}
	else
		return 0;
	mpz_class target, offset, offsetLimit(1);
	uint64_t trailingZeros;
	target = blockHeader.target(powVersion, trailingZeros);
	offsetLimit <<= trailingZeros;
	// Calculate the PoW result
	if (powVersion == -1)
		mpz_import(offset.get_mpz_t(), 32, -1, sizeof(uint8_t), 0, 0, &blockHeader.nOffset[0]); // [31-0 Offset]
	else if (powVersion == 1) {
		const uint8_t* rawOffset(&blockHeader.nOffset[0]); // [31-30 Primorial Number|29-14 Primorial Factor|13-2 Primorial Offset|1-0 Reserved/Version]
		const uint16_t primorialNumber(reinterpret_cast<const uint16_t*>(&rawOffset[30])[0]);
		mpz_class primorial(1), primorialFactor, primorialOffset;
		for (uint16_t i(0) ; i < primorialNumber ; i++) {
			mpz_mul_ui(primorial.get_mpz_t(), primorial.get_mpz_t(), primeTable[i]);
			if (primorial > offsetLimit)
				return 0; // Too large Primorial Number
		}
		mpz_import(primorialFactor.get_mpz_t(), 16, -1, sizeof(uint8_t), 0, 0, &rawOffset[14]);
		mpz_import(primorialOffset.get_mpz_t(), 12, -1, sizeof(uint8_t), 0, 0, &rawOffset[2]);
		offset = primorial - (target % primorial) + primorialFactor*primorial + primorialOffset;
	}
	if (offset >= offsetLimit)
		return 0; // Too large Offset
	mpz_class result(target + offset);
	
	// Check PoW result
	uint32_t longestSharePrimeCount(0);
	for (const auto &pattern : acceptedPatterns) {
		uint32_t sharePrimeCount(CheckConstellation(result, pattern, 32));
		if (sharePrimeCount > longestSharePrimeCount)
			longestSharePrimeCount = sharePrimeCount;
	}
	return longestSharePrimeCount;
}
