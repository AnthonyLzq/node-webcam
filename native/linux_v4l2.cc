#include <node_api.h>

#include <errno.h>
#include <fcntl.h>
#include <linux/videodev2.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/select.h>
#include <unistd.h>

#include <algorithm>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {
  constexpr uint32_t DEFAULT_WIDTH = 1280;
  constexpr uint32_t DEFAULT_HEIGHT = 720;
  constexpr uint32_t DEFAULT_TIMEOUT_MS = 2000;
  constexpr const char* DEFAULT_DEVICE = "/dev/video0";

  struct NativeOptions {
    std::string device = DEFAULT_DEVICE;
    uint32_t width = DEFAULT_WIDTH;
    uint32_t height = DEFAULT_HEIGHT;
    uint32_t timeoutMs = DEFAULT_TIMEOUT_MS;
  };

  struct MappedBuffer {
    void* start = nullptr;
    size_t length = 0;
  };

  class NativeCaptureError : public std::runtime_error {
    private:
    std::string code_;

    public:
    NativeCaptureError(std::string code, const std::string& message)
      : std::runtime_error(message), code_(std::move(code)) {}

    const std::string& code() const {
      return code_;
    }
  };

  /**
   * Owns a Linux file descriptor and closes it automatically.
   *
   * This prevents leaks when capture fails halfway through the V4L2 flow.
   */
  class FileDescriptor {
    private:
    int fileDescriptor_;

    public:
    explicit FileDescriptor(int fileDescriptor)
      : fileDescriptor_(fileDescriptor) {}

    FileDescriptor(const FileDescriptor&) = delete;
    FileDescriptor& operator=(const FileDescriptor&) = delete;

    ~FileDescriptor() {
      if (fileDescriptor_ >= 0) close(fileDescriptor_);
    }

    int get() const {
      return fileDescriptor_;
    }
  };

  /**
   * Owns V4L2 mmap() regions and unmaps them automatically.
   */
  class MappedBuffers {
    private:
    std::vector<MappedBuffer> buffers_;

    public:
    MappedBuffers() = default;

    MappedBuffers(const MappedBuffers&) = delete;
    MappedBuffers& operator=(const MappedBuffers&) = delete;

    MappedBuffers(MappedBuffers&&) noexcept = default;
    MappedBuffers& operator=(MappedBuffers&&) noexcept = default;

    ~MappedBuffers() {
      for (const auto& buffer : buffers_) {
        if (buffer.start && buffer.start != MAP_FAILED)
          munmap(buffer.start, buffer.length);
      }
    }

    void push(MappedBuffer buffer) {
      buffers_.push_back(buffer);
    }

    MappedBuffer& at(size_t index) {
      return buffers_.at(index);
    }

    size_t size() const {
      return buffers_.size();
    }
  };

  std::string SystemError(const std::string& message) {
    return message + ": " + strerror(errno);
  }

  NativeCaptureError NativeSystemError(
    const std::string& code,
    const std::string& message
  ) {
    return NativeCaptureError(code, SystemError(message));
  }

  std::string OpenErrorCode() {
    switch (errno) {
      case ENOENT:
      case ENODEV:
        return "NODE_WEBCAM_NATIVE_DEVICE_NOT_FOUND";
      case EACCES:
      case EPERM:
        return "NODE_WEBCAM_NATIVE_PERMISSION_DENIED";
      case EBUSY:
        return "NODE_WEBCAM_NATIVE_DEVICE_BUSY";
      default:
        return "NODE_WEBCAM_NATIVE_CAPTURE_FAILED";
    }
  }

  /**
   * Runs ioctl() and retries transient EINTR interruptions.
   *
   * V4L2 is driven through ioctl calls. EINTR means the system call was
   * interrupted by a signal, not that the camera operation failed.
   *
   * Mental model:
   * - fd: the opened device, such as /dev/video0
   * - request: the V4L2 command to send, such as VIDIOC_QUERYCAP
   * - arg: the input/output struct that ioctl reads from or writes into
   */
  int Xioctl(int fd, unsigned long request, void* arg) {
    int result;

    do {
      result = ioctl(fd, request, arg);
    } while (result == -1 && errno == EINTR);

    return result;
  }

  void ThrowNodeError(
    napi_env env,
    const std::string& code,
    const std::string& message
  ) {
    napi_throw_error(env, code.c_str(), message.c_str());
  }

  /**
   * Checks whether a JavaScript object has a named property.
   */
  bool HasNamedProperty(napi_env env, napi_value object, const char* name) {
    bool hasProperty = false;

    napi_has_named_property(env, object, name, &hasProperty);

    return hasProperty;
  }

  /**
   * Reads a string property from a JavaScript object.
   *
   * Returns defaultValue when the property is missing.
   */
  std::string GetStringProperty(
    napi_env env,
    napi_value object,
    const char* name,
    const std::string& defaultValue
  ) {
    if (!HasNamedProperty(env, object, name)) return defaultValue;

    napi_value value;

    napi_get_named_property(env, object, name, &value);

    size_t length = 0;

    napi_get_value_string_utf8(env, value, nullptr, 0, &length);

    std::vector<char> buffer(length + 1);

    napi_get_value_string_utf8(
      env,
      value,
      buffer.data(),
      buffer.size(),
      &length
    );

    return std::string(buffer.data(), length);
  }

  /**
   * Reads an unsigned 32-bit integer property from a JavaScript object.
   *
   * Returns defaultValue when the property is missing.
   */
  uint32_t GetUint32Property(
    napi_env env,
    napi_value object,
    const char* name,
    uint32_t defaultValue
  ) {
    if (!HasNamedProperty(env, object, name)) return defaultValue;

    napi_value value;
    napi_get_named_property(env, object, name, &value);

    uint32_t result = defaultValue;
    napi_get_value_uint32(env, value, &result);

    return result;
  }

  /**
   * Parses the optional JavaScript options object:
   *
   * captureMjpeg({ device, width, height, timeoutMs })
   */
  NativeOptions ParseOptions(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];

    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    NativeOptions options;

    if (argc == 0) return options;

    napi_valuetype argType;
    napi_typeof(env, args[0], &argType);

    if (argType != napi_object) return options;

    options.device = GetStringProperty(env, args[0], "device", options.device);
    options.width = GetUint32Property(env, args[0], "width", options.width);
    options.height = GetUint32Property(env, args[0], "height", options.height);
    options.timeoutMs =
      GetUint32Property(env, args[0], "timeoutMs", options.timeoutMs);

    return options;
  }

  /**
   * Returns the V4L2 capability bitmask that should be trusted.
   *
   * Some drivers expose both broad device capabilities and effective per-device
   * capabilities. When V4L2_CAP_DEVICE_CAPS is set, device_caps is the effective
   * set for this opened device. Otherwise capabilities is the only available set.
   */
  uint32_t GetEffectiveCapabilities(const v4l2_capability& capability) {
    if (capability.capabilities & V4L2_CAP_DEVICE_CAPS)
      return capability.device_caps;

    return capability.capabilities;
  }

  // Step 1: verify that the file descriptor is actually a capture-capable V4L2
  // device and that it supports streaming buffers.
  void AssertCaptureDevice(int fd, const std::string& device) {
    v4l2_capability capability = {};

    if (Xioctl(fd, VIDIOC_QUERYCAP, &capability) == -1)
      throw NativeSystemError(
        "NODE_WEBCAM_NATIVE_DEVICE_UNSUPPORTED",
        "Unable to query V4L2 capabilities for " + device
      );

    const uint32_t capabilities = GetEffectiveCapabilities(capability);

    if (!(capabilities & V4L2_CAP_VIDEO_CAPTURE))
      throw NativeCaptureError(
        "NODE_WEBCAM_NATIVE_DEVICE_UNSUPPORTED",
        "V4L2 device does not support video capture: " + device
      );

    if (!(capabilities & V4L2_CAP_STREAMING))
      throw NativeCaptureError(
        "NODE_WEBCAM_NATIVE_DEVICE_UNSUPPORTED",
        "V4L2 device does not support streaming IO: " + device
      );
  }

  // Step 2: ask the camera for MJPEG frames at the requested resolution. This is
  // intentionally narrow for the spike because MJPEG can be returned directly as a
  // JPEG Buffer to JavaScript.
  void ConfigureMjpegFormat(int fd, const NativeOptions& options) {
    v4l2_format format = {};
    format.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    format.fmt.pix.width = options.width;
    format.fmt.pix.height = options.height;
    format.fmt.pix.pixelformat = V4L2_PIX_FMT_MJPEG;
    format.fmt.pix.field = V4L2_FIELD_ANY;

    if (Xioctl(fd, VIDIOC_S_FMT, &format) == -1)
      throw NativeSystemError(
        errno == EBUSY
          ? "NODE_WEBCAM_NATIVE_DEVICE_BUSY"
          : "NODE_WEBCAM_NATIVE_FORMAT_UNSUPPORTED",
        "Unable to configure V4L2 MJPEG format"
      );

    if (format.fmt.pix.pixelformat != V4L2_PIX_FMT_MJPEG)
      throw NativeCaptureError(
        "NODE_WEBCAM_NATIVE_FORMAT_UNSUPPORTED",
        "V4L2 device did not accept MJPEG pixel format"
      );
  }

  /**
   * Step 3: ask the driver for streaming buffers and mmap() them into this
   * process. The camera will write frame data into these buffers.
   *
   * Mental model:
   * - VIDIOC_REQBUFS asks the driver to reserve N capture buffers.
   * - VIDIOC_QUERYBUF returns the size and mmap offset for each reserved buffer.
   * - mmap() makes each driver-owned buffer visible as a pointer in this process.
   * - Later, VIDIOC_DQBUF tells us which mapped buffer contains the next frame.
   */
  MappedBuffers RequestMappedBuffers(int fd) {
    v4l2_requestbuffers request = {};
    request.count = 4;
    request.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    request.memory = V4L2_MEMORY_MMAP;

    if (Xioctl(fd, VIDIOC_REQBUFS, &request) == -1)
      throw NativeSystemError(
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "Unable to request V4L2 buffers"
      );

    if (request.count < 2)
      throw NativeCaptureError(
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "V4L2 device returned insufficient buffers"
      );

    MappedBuffers mappedBuffers;

    for (uint32_t index = 0; index < request.count; index += 1) {
      v4l2_buffer buffer = {};
      buffer.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
      buffer.memory = V4L2_MEMORY_MMAP;
      buffer.index = index;

      if (Xioctl(fd, VIDIOC_QUERYBUF, &buffer) == -1)
        throw NativeSystemError(
          "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
          "Unable to query V4L2 buffer"
        );

      // Map this driver buffer into process memory. The returned pointer is where
      // frame bytes will become readable after the driver fills this buffer.
      void* start = mmap(
        nullptr,
        buffer.length,
        PROT_READ | PROT_WRITE,
        MAP_SHARED,
        fd,
        buffer.m.offset
      );

      if (start == MAP_FAILED)
        throw NativeSystemError(
          "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
          "Unable to map V4L2 buffer"
        );

      mappedBuffers.push({start, buffer.length});
    }

    return mappedBuffers;
  }

  // Step 4: hand the mapped buffers to the driver so it can fill them with frames.
  void QueueBuffers(int fd, MappedBuffers& mappedBuffers) {
    for (uint32_t index = 0; index < mappedBuffers.size(); index += 1) {
      v4l2_buffer buffer = {};
      buffer.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
      buffer.memory = V4L2_MEMORY_MMAP;
      buffer.index = index;

      if (Xioctl(fd, VIDIOC_QBUF, &buffer) == -1)
        throw NativeSystemError(
          "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
          "Unable to queue V4L2 buffer"
        );
    }
  }

  // Step 5: wait until the device signals that at least one queued buffer has
  // frame data available.
  void WaitForFrame(int fd, uint32_t timeoutMs) {
    fd_set descriptors;
    timeval timeout = {};

    FD_ZERO(&descriptors);
    FD_SET(fd, &descriptors);

    timeout.tv_sec = timeoutMs / 1000;
    timeout.tv_usec = static_cast<suseconds_t>((timeoutMs % 1000) * 1000);

    const int result = select(fd + 1, &descriptors, nullptr, nullptr, &timeout);

    if (result == -1)
      throw NativeSystemError(
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "Unable to wait for V4L2 frame"
      );

    if (result == 0)
      throw NativeCaptureError(
        "NODE_WEBCAM_NATIVE_FRAME_TIMEOUT",
        "Timed out waiting for V4L2 frame"
      );
  }

  // End-to-end V4L2 capture:
  // 1. open device
  // 2. verify capabilities
  // 3. configure MJPEG
  // 4. mmap and queue buffers
  // 5. stream on
  // 6. dequeue one filled buffer
  // 7. copy its bytes into a std::vector<uint8_t>
  std::vector<uint8_t> CaptureMjpegFrame(const NativeOptions& options) {
    const int fd = open(options.device.c_str(), O_RDWR | O_NONBLOCK, 0);

    if (fd == -1)
      throw NativeSystemError(
        OpenErrorCode(),
        "Unable to open V4L2 device " + options.device
      );

    FileDescriptor device(fd);

    AssertCaptureDevice(device.get(), options.device);
    ConfigureMjpegFormat(device.get(), options);

    MappedBuffers mappedBuffers = RequestMappedBuffers(device.get());

    QueueBuffers(device.get(), mappedBuffers);

    v4l2_buf_type type = V4L2_BUF_TYPE_VIDEO_CAPTURE;

    if (Xioctl(device.get(), VIDIOC_STREAMON, &type) == -1)
      throw NativeSystemError(
        errno == EBUSY
          ? "NODE_WEBCAM_NATIVE_DEVICE_BUSY"
          : "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "Unable to start V4L2 stream"
      );

    bool streaming = true;

    try {
      for (;;) {
        WaitForFrame(device.get(), options.timeoutMs);

        v4l2_buffer buffer = {};
        buffer.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
        buffer.memory = V4L2_MEMORY_MMAP;

        if (Xioctl(device.get(), VIDIOC_DQBUF, &buffer) == -1) {
          if (errno == EAGAIN) continue;

          throw NativeSystemError(
            "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
            "Unable to dequeue V4L2 frame"
          );
        }

        if (buffer.index >= mappedBuffers.size())
          throw NativeCaptureError(
            "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
            "V4L2 returned an out-of-range buffer index"
          );

        if (buffer.bytesused == 0)
          throw NativeCaptureError(
            "NODE_WEBCAM_NATIVE_FRAME_EMPTY",
            "V4L2 returned an empty frame"
          );

        const MappedBuffer& mappedBuffer = mappedBuffers.at(buffer.index);
        const auto* frameStart =
          static_cast<const uint8_t*>(mappedBuffer.start);
        const size_t bytesUsed =
          std::min<size_t>(buffer.bytesused, mappedBuffer.length);
        std::vector<uint8_t> frame(frameStart, frameStart + bytesUsed);

        if (streaming) {
          Xioctl(device.get(), VIDIOC_STREAMOFF, &type);
          streaming = false;
        }

        return frame;
      }
    } catch (...) {
      if (streaming) Xioctl(device.get(), VIDIOC_STREAMOFF, &type);

      throw;
    }
  }

  // Availability is intentionally conservative: the addon is considered usable
  // only if the target device exists, supports capture/streaming, and accepts
  // MJPEG at the requested resolution.
  bool IsDeviceAvailable(const NativeOptions& options) {
    const int fd = open(options.device.c_str(), O_RDWR | O_NONBLOCK, 0);

    if (fd == -1) return false;

    FileDescriptor device(fd);

    try {
      AssertCaptureDevice(device.get(), options.device);
      ConfigureMjpegFormat(device.get(), options);

      return true;
    } catch (...) {
      return false;
    }
  }

  // JS export: isAvailable(options) -> boolean
  napi_value IsAvailable(napi_env env, napi_callback_info info) {
    const NativeOptions options = ParseOptions(env, info);
    napi_value result;

    napi_get_boolean(env, IsDeviceAvailable(options), &result);

    return result;
  }

  // JS export: captureMjpeg(options) -> Buffer
  napi_value CaptureMjpeg(napi_env env, napi_callback_info info) {
    try {
      const NativeOptions options = ParseOptions(env, info);
      const std::vector<uint8_t> frame = CaptureMjpegFrame(options);
      napi_value buffer;

      napi_create_buffer_copy(env, frame.size(), frame.data(), nullptr, &buffer);

      return buffer;
    } catch (const NativeCaptureError& error) {
      ThrowNodeError(env, error.code(), error.what());

      return nullptr;
    } catch (const std::exception& error) {
      ThrowNodeError(
        env,
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        error.what()
      );

      return nullptr;
    }
  }

  // Register the native functions on module.exports.
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
