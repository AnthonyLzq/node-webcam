#include <node_api.h>

#include <errno.h>
#include <fcntl.h>
#include <linux/videodev2.h>
#include <poll.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>

#include <algorithm>
#include <chrono>
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
  using Clock = std::chrono::steady_clock;

  struct NativeOptions {
    std::string device = DEFAULT_DEVICE;
    uint32_t width = DEFAULT_WIDTH;
    uint32_t height = DEFAULT_HEIGHT;
    uint32_t timeoutMs = DEFAULT_TIMEOUT_MS;
  };

  struct AsyncCaptureData {
    napi_deferred deferred = nullptr;
    napi_async_work work = nullptr;
    NativeOptions options;
    std::vector<uint8_t> frame;
    std::string errorCode;
    std::string errorMessage;
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

  void AssertNapiOk(napi_status status, const std::string& message) {
    if (status != napi_ok)
      throw NativeCaptureError("NODE_WEBCAM_NATIVE_CAPTURE_FAILED", message);
  }

  napi_value CreateNodeError(
    napi_env env,
    const std::string& code,
    const std::string& message
  ) {
    napi_value error;
    napi_value errorMessage;
    napi_value errorCode;

    if (
      napi_create_string_utf8(
        env,
        message.c_str(),
        NAPI_AUTO_LENGTH,
        &errorMessage
      ) != napi_ok ||
      napi_create_error(env, nullptr, errorMessage, &error) != napi_ok ||
      napi_create_string_utf8(
        env,
        code.c_str(),
        NAPI_AUTO_LENGTH,
        &errorCode
      ) != napi_ok ||
      napi_set_named_property(env, error, "code", errorCode) != napi_ok
    ) {
      napi_get_undefined(env, &error);
    }

    return error;
  }

  void RejectDeferred(
    napi_env env,
    napi_deferred deferred,
    const std::string& code,
    const std::string& message
  ) {
    const napi_status status =
      napi_reject_deferred(env, deferred, CreateNodeError(env, code, message));

    if (status != napi_ok)
      napi_throw_error(env, code.c_str(), message.c_str());
  }

  void ThrowNodeError(
    napi_env env,
    const std::string& code,
    const std::string& message
  ) {
    const napi_status status = napi_throw(env, CreateNodeError(env, code, message));

    if (status != napi_ok)
      napi_throw_error(env, code.c_str(), message.c_str());
  }

  /**
   * Checks whether a JavaScript object has a named property.
   */
  bool HasNamedProperty(napi_env env, napi_value object, const char* name) {
    bool hasProperty = false;

    AssertNapiOk(
      napi_has_named_property(env, object, name, &hasProperty),
      std::string("Unable to inspect native option ") + name
    );

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

    AssertNapiOk(
      napi_get_named_property(env, object, name, &value),
      std::string("Unable to read native option ") + name
    );

    size_t length = 0;

    AssertNapiOk(
      napi_get_value_string_utf8(env, value, nullptr, 0, &length),
      std::string("Native option must be a string: ") + name
    );

    std::vector<char> buffer(length + 1);

    AssertNapiOk(
      napi_get_value_string_utf8(
        env,
        value,
        buffer.data(),
        buffer.size(),
        &length
      ),
      std::string("Unable to decode native option ") + name
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
    AssertNapiOk(
      napi_get_named_property(env, object, name, &value),
      std::string("Unable to read native option ") + name
    );

    uint32_t result = defaultValue;
    AssertNapiOk(
      napi_get_value_uint32(env, value, &result),
      std::string("Native option must be an unsigned integer: ") + name
    );

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

    AssertNapiOk(
      napi_get_cb_info(env, info, &argc, args, nullptr, nullptr),
      "Unable to read native callback arguments"
    );

    NativeOptions options;

    if (argc == 0) return options;

    napi_valuetype argType;
    AssertNapiOk(
      napi_typeof(env, args[0], &argType),
      "Unable to inspect native callback argument"
    );

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

  bool SupportsImplementedCapturePath(const v4l2_capability& capability) {
    const uint32_t capabilities = GetEffectiveCapabilities(capability);

    return (capabilities & V4L2_CAP_VIDEO_CAPTURE) &&
           (capabilities & V4L2_CAP_STREAMING);
  }

  // Step 1: verify that the file descriptor is compatible with the capture path
  // implemented below: single-planar V4L2 video capture with streaming buffers.
  void AssertCaptureDevice(int fd, const std::string& device) {
    v4l2_capability capability = {};

    if (Xioctl(fd, VIDIOC_QUERYCAP, &capability) == -1)
      throw NativeSystemError(
        "NODE_WEBCAM_NATIVE_DEVICE_UNSUPPORTED",
        "Unable to query V4L2 capabilities for " + device
      );

    if (!SupportsImplementedCapturePath(capability))
      throw NativeCaptureError(
        "NODE_WEBCAM_NATIVE_DEVICE_UNSUPPORTED",
        "V4L2 device does not support single-planar streaming video capture: " +
          device
      );
  }

  bool IsV4l2CaptureDevice(const NativeOptions& options) {
    const int fd = open(options.device.c_str(), O_RDONLY | O_NONBLOCK, 0);

    if (fd == -1) return false;

    FileDescriptor device(fd);
    v4l2_capability capability = {};

    if (Xioctl(device.get(), VIDIOC_QUERYCAP, &capability) == -1)
      return false;

    return SupportsImplementedCapturePath(capability);
  }

  // Step 2: ask the camera for MJPEG frames at the requested resolution. This is
  // intentionally narrow for the spike because MJPEG can be returned directly as a
  // JPEG Buffer to JavaScript.
  void ConfigureMjpegFormat(
    int fd,
    const NativeOptions& options,
    bool applyFormat
  ) {
    v4l2_format format = {};
    format.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    format.fmt.pix.width = options.width;
    format.fmt.pix.height = options.height;
    format.fmt.pix.pixelformat = V4L2_PIX_FMT_MJPEG;
    format.fmt.pix.field = V4L2_FIELD_ANY;

    const unsigned long request = applyFormat ? VIDIOC_S_FMT : VIDIOC_TRY_FMT;

    if (Xioctl(fd, request, &format) == -1)
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

    if (
      format.fmt.pix.width != options.width ||
      format.fmt.pix.height != options.height
    )
      throw NativeCaptureError(
        "NODE_WEBCAM_NATIVE_FORMAT_UNSUPPORTED",
        "V4L2 device did not accept requested MJPEG resolution"
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

  void ReleaseMappedBuffers(int fd) {
    v4l2_requestbuffers request = {};
    request.count = 0;
    request.type = V4L2_BUF_TYPE_VIDEO_CAPTURE;
    request.memory = V4L2_MEMORY_MMAP;

    if (Xioctl(fd, VIDIOC_REQBUFS, &request) == -1)
      throw NativeSystemError(
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "Unable to release V4L2 buffers"
      );
  }

  void ProbeMappedBufferSupport(int fd) {
    try {
      {
        MappedBuffers mappedBuffers = RequestMappedBuffers(fd);
      }

      ReleaseMappedBuffers(fd);
    } catch (...) {
      try {
        ReleaseMappedBuffers(fd);
      } catch (...) {
      }

      throw;
    }
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
  int GetRemainingTimeoutMs(Clock::time_point deadline) {
    const auto now = Clock::now();

    if (now >= deadline) return 0;

    const auto remaining =
      std::chrono::duration_cast<std::chrono::milliseconds>(deadline - now)
        .count();

    return static_cast<int>(std::max<int64_t>(1, remaining));
  }

  void WaitForFrame(
    int fd,
    uint32_t timeoutMs,
    Clock::time_point deadline
  ) {
    const int pollTimeoutMs =
      timeoutMs == 0 ? -1 : GetRemainingTimeoutMs(deadline);

    if (timeoutMs > 0 && pollTimeoutMs == 0)
      throw NativeCaptureError(
        "NODE_WEBCAM_NATIVE_FRAME_TIMEOUT",
        "Timed out waiting for V4L2 frame"
      );

    pollfd descriptor = {};
    descriptor.fd = fd;
    descriptor.events = POLLIN;

    const int result = poll(&descriptor, 1, pollTimeoutMs);

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
    ConfigureMjpegFormat(device.get(), options, true);

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
    const auto deadline =
      options.timeoutMs > 0
        ? Clock::now() + std::chrono::milliseconds(options.timeoutMs)
        : Clock::time_point{};

    try {
      for (;;) {
        WaitForFrame(device.get(), options.timeoutMs, deadline);

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
  // only if the target device exists, supports capture/streaming, accepts MJPEG
  // at the requested resolution, and can allocate/mmap the buffers used later by
  // the real capture path. It does not start streaming or dequeue frames.
  bool IsDeviceAvailable(const NativeOptions& options) {
    const int fd = open(options.device.c_str(), O_RDWR | O_NONBLOCK, 0);

    if (fd == -1) return false;

    FileDescriptor device(fd);

    try {
      AssertCaptureDevice(device.get(), options.device);
      ConfigureMjpegFormat(device.get(), options, false);
      ProbeMappedBufferSupport(device.get());

      return true;
    } catch (...) {
      return false;
    }
  }

  // JS export: isAvailable(options) -> boolean
  napi_value IsAvailable(napi_env env, napi_callback_info info) {
    napi_value result;
    bool available = false;

    try {
      const NativeOptions options = ParseOptions(env, info);
      available = IsDeviceAvailable(options);
    } catch (...) {
      available = false;
    }

    if (napi_get_boolean(env, available, &result) != napi_ok)
      return nullptr;

    return result;
  }

  // JS export: isCaptureDevice(options) -> boolean
  napi_value IsCaptureDevice(napi_env env, napi_callback_info info) {
    napi_value result;
    bool available = false;

    try {
      const NativeOptions options = ParseOptions(env, info);
      available = IsV4l2CaptureDevice(options);
    } catch (...) {
      available = false;
    }

    if (napi_get_boolean(env, available, &result) != napi_ok)
      return nullptr;

    return result;
  }

  // JS export: captureMjpeg(options) -> Buffer
  napi_value CaptureMjpeg(napi_env env, napi_callback_info info) {
    try {
      const NativeOptions options = ParseOptions(env, info);
      const std::vector<uint8_t> frame = CaptureMjpegFrame(options);
      napi_value buffer;

      AssertNapiOk(
        napi_create_buffer_copy(
          env,
          frame.size(),
          frame.data(),
          nullptr,
          &buffer
        ),
        "Unable to create native V4L2 capture buffer"
      );

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

  void ExecuteCaptureMjpeg(napi_env, void* rawData) {
    auto* data = static_cast<AsyncCaptureData*>(rawData);

    try {
      data->frame = CaptureMjpegFrame(data->options);
    } catch (const NativeCaptureError& error) {
      data->errorCode = error.code();
      data->errorMessage = error.what();
    } catch (const std::exception& error) {
      data->errorCode = "NODE_WEBCAM_NATIVE_CAPTURE_FAILED";
      data->errorMessage = error.what();
    }
  }

  void CompleteCaptureMjpeg(napi_env env, napi_status status, void* rawData) {
    auto* data = static_cast<AsyncCaptureData*>(rawData);

    if (status != napi_ok && data->errorMessage.empty()) {
      data->errorCode = "NODE_WEBCAM_NATIVE_CAPTURE_FAILED";
      data->errorMessage = "Native V4L2 async capture was cancelled";
    }

    if (!data->errorMessage.empty()) {
      RejectDeferred(
        env,
        data->deferred,
        data->errorCode,
        data->errorMessage
      );
    } else {
      napi_value buffer;

      const napi_status bufferStatus = napi_create_buffer_copy(
        env,
        data->frame.size(),
        data->frame.data(),
        nullptr,
        &buffer
      );

      if (bufferStatus != napi_ok) {
        RejectDeferred(
          env,
          data->deferred,
          "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
          "Unable to create native V4L2 async capture buffer"
        );
      } else if (napi_resolve_deferred(env, data->deferred, buffer) != napi_ok) {
        napi_throw_error(
          env,
          "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
          "Unable to resolve native V4L2 async capture"
        );
      }
    }

    if (data->work) napi_delete_async_work(env, data->work);
    delete data;
  }

  // JS export: captureMjpegAsync(options) -> Promise<Buffer>
  napi_value CaptureMjpegAsync(napi_env env, napi_callback_info info) {
    auto* data = new AsyncCaptureData();
    napi_value promise;
    napi_value resourceName;

    if (napi_create_promise(env, &data->deferred, &promise) != napi_ok) {
      delete data;
      ThrowNodeError(
        env,
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "Unable to create native V4L2 async capture promise"
      );

      return nullptr;
    }

    try {
      data->options = ParseOptions(env, info);
      AssertNapiOk(
        napi_create_string_utf8(
          env,
          "node-webcam:captureMjpegAsync",
          NAPI_AUTO_LENGTH,
          &resourceName
        ),
        "Unable to create native V4L2 async capture resource name"
      );
    } catch (const NativeCaptureError& error) {
      RejectDeferred(env, data->deferred, error.code(), error.what());
      delete data;

      return promise;
    } catch (const std::exception& error) {
      RejectDeferred(
        env,
        data->deferred,
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        error.what()
      );
      delete data;

      return promise;
    }

    const napi_status createStatus = napi_create_async_work(
      env,
      nullptr,
      resourceName,
      ExecuteCaptureMjpeg,
      CompleteCaptureMjpeg,
      data,
      &data->work
    );

    if (createStatus != napi_ok) {
      RejectDeferred(
        env,
        data->deferred,
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "Unable to create native V4L2 async capture work"
      );
      delete data;

      return promise;
    }

    const napi_status queueStatus = napi_queue_async_work(env, data->work);

    if (queueStatus != napi_ok) {
      napi_delete_async_work(env, data->work);
      data->work = nullptr;
      RejectDeferred(
        env,
        data->deferred,
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "Unable to queue native V4L2 async capture work"
      );
      delete data;
    }

    return promise;
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
      napi_throw_error(
        env,
        "NODE_WEBCAM_NATIVE_CAPTURE_FAILED",
        "Unable to define native V4L2 addon exports"
      );

    return exports;
  }
}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
