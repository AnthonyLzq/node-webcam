#include <node_api.h>

namespace {
  // This file is compiled for non-Linux platforms during the spike. It keeps the
  // native module loadable, but explicitly reports that capture is unavailable.
  napi_value IsAvailable(napi_env env, napi_callback_info) {
    napi_value result;

    napi_get_boolean(env, false, &result);

    return result;
  }

  // Keep the same JS-facing API as the Linux addon so callers can probe
  // availability before attempting capture.
  napi_value CaptureMjpeg(napi_env env, napi_callback_info) {
    napi_throw_error(
      env,
      nullptr,
      "Native webcam capture is only implemented on Linux in this spike"
    );

    return nullptr;
  }

  // Export the two functions used by the smoke script:
  // - isAvailable(options)
  // - captureMjpeg(options)
  napi_value Init(napi_env env, napi_value exports) {
    napi_property_descriptor properties[] = {
      {
        "isAvailable",
        nullptr,
        IsAvailable,
        nullptr,
        nullptr,
        nullptr,
        napi_default,
        nullptr
      },
      {
        "captureMjpeg",
        nullptr,
        CaptureMjpeg,
        nullptr,
        nullptr,
        nullptr,
        napi_default,
        nullptr
      }
    };

    napi_define_properties(env, exports, 2, properties);

    return exports;
  }
}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
