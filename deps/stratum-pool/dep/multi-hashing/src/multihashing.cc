#include <node.h>
#include <node_buffer.h>
#include <nan.h>

extern "C" {
}

#include "stella.h"

#define SET_BUFFER_RETURN(x, len) \
    info.GetReturnValue().Set(Nan::CopyBuffer(x, len).ToLocalChecked());

#define SET_BOOLEAN_RETURN(x) \
    info.GetReturnValue().Set(Nan::To<Boolean>(x).ToChecked());

#define RETURN_EXCEPT(msg) \
    return Nan::ThrowError(msg)

#define DECLARE_FUNC(x) \
    NAN_METHOD(x)

#define DECLARE_CALLBACK(name, hash, output_len) \
    DECLARE_FUNC(name) { \
 \
    if (info.Length() < 1) \
        RETURN_EXCEPT("You must provide one argument."); \
 \
    v8::Local<v8::Object> target = Nan::To<v8::Object>(info[0]).ToLocalChecked(); \
 \
    if(!node::Buffer::HasInstance(target)) \
        RETURN_EXCEPT("Argument should be a buffer object."); \
 \
    char *input = node::Buffer::Data(target); \
    char output[32]; \
 \
    uint32_t input_len = node::Buffer::Length(target); \
 \
    hash(input, output, input_len); \
 \
    SET_BUFFER_RETURN(output, output_len); \
}

DECLARE_FUNC(stella) {
    if (info.Length() < 1)
       RETURN_EXCEPT("You must provide a buffer containing the Block Header and Constellation Data");

    v8::Local<v8::Object> target = Nan::To<v8::Object>(info[0]).ToLocalChecked();
    if(!node::Buffer::HasInstance(target))
       RETURN_EXCEPT("Argument should be a buffer object.");

    const uint8_t *input(reinterpret_cast<const uint8_t*>(node::Buffer::Data(target)));
    char output[32]{0};
    int32_t powVersion(reinterpret_cast<const int32_t*>(&input[112])[0]);
    std::vector<std::vector<int32_t>> constellationsOffsets(input[116]);
    uint32_t constellationLength(input[117]);
    int32_t pos(118);
    for (uint32_t i(0) ; i < constellationsOffsets.size() ; i++) {
        std::vector<int32_t> constellationOffsets(constellationLength);
        for (uint32_t j(0) ; j < constellationOffsets.size() ; j++) {
            constellationOffsets[j] = input[pos];
            pos++;
        }
        constellationsOffsets[i] = constellationOffsets;
    }
    reinterpret_cast<uint32_t*>(output)[0] = GetSharePrimeCount(input, powVersion, constellationsOffsets);
    SET_BUFFER_RETURN(output, 32);
}

NAN_MODULE_INIT(init) {
    NAN_EXPORT(target, stella);
}

NODE_MODULE(multihashing, init)
