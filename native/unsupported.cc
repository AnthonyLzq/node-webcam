#include <node_api.h>

namespace {
  constexpr const char* ERROR_CODE = "NODE_WEBCAM_NATIVE_UNSUPPORTED";
  constexpr const char* ERROR_MESSAGE =
    "Native webcam capture is only implemented on Linux in this spike";

  napi_value CreateNodeError(napi_env env) {
    napi_value message;
    napi_value error;
    napi_value code;

    if (
      napi_create_string_utf8(env, ERROR_MESSAGE, NAPI_AUTO_LENGTH, &message) !=
        napi_ok ||
      napi_create_error(env, nullptr, message, &error) != napi_ok ||
      napi_create_string_utf8(env, ERROR_CODE, NAPI_AUTO_LENGTH, &code) !=
        napi_ok ||
      napi_set_named_property(env, error, "code", code) != napi_ok
    )
      return nullptr;

    return error;
  }

  void ThrowUnsupported(napi_env env) {
    if (napi_throw_error(env, ERROR_CODE, ERROR_MESSAGE) != napi_ok)
      napi_fatal_error(
        "node-webcam",
        NAPI_AUTO_LENGTH,
        "Unable to throw unsupported native webcam error",
        NAPI_AUTO_LENGTH
      );
  }

  // This file is compiled for non-Linux platforms during the spike. It keeps the
  // native module loadable, but explicitly reports that capture is unavailable.
  napi_value IsAvailable(napi_env env, napi_callback_info) {
    napi_value result;

    if (napi_get_boolean(env, false, &result) != napi_ok) return nullptr;

    return result;
  }

  napi_value IsCaptureDevice(napi_env env, napi_callback_info) {
    napi_value result;

    if (napi_get_boolean(env, false, &result) != napi_ok) return nullptr;

    return result;
  }

  // Keep the same JS-facing API as the Linux addon so callers can probe
  // availability before attempting capture.
  napi_value CaptureMjpeg(napi_env env, napi_callback_info) {
    ThrowUnsupported(env);

    return nullptr;
  }

  napi_value CaptureMjpegAsync(napi_env env, napi_callback_info) {
    napi_deferred deferred;
    napi_value promise;

    if (napi_create_promise(env, &deferred, &promise) != napi_ok) {
      ThrowUnsupported(env);

      return nullptr;
    }

    napi_value error = CreateNodeError(env);

    if (
      error == nullptr ||
      napi_reject_deferred(env, deferred, error) != napi_ok
    )
      ThrowUnsupported(env);

    return promise;
  }

  // Export the functions used by the smoke script and runtime loader:
  // - isAvailable(options)
  // - isCaptureDevice(options)
  // - captureMjpeg(options)
  // - captureMjpegAsync(options)
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
      },
      {
        "isCaptureDevice",
        nullptr,
        IsCaptureDevice,
        nullptr,
        nullptr,
        nullptr,
        napi_default,
        nullptr
      },
      {
        "captureMjpegAsync",
        nullptr,
        CaptureMjpegAsync,
        nullptr,
        nullptr,
        nullptr,
        napi_default,
        nullptr
      }
    };

    if (napi_define_properties(env, exports, 4, properties) != napi_ok)
      ThrowUnsupported(env);

    return exports;
  }
}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
