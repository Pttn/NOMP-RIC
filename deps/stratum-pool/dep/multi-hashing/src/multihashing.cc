#include <node.h>
#include <node_buffer.h>
#include <nan.h>

extern "C" {
}

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


NAN_MODULE_INIT(init) {
}

NODE_MODULE(multihashing, init)
