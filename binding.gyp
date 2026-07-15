{
  "targets": [
    {
      "target_name": "node_webcam_native",
      "conditions": [
        [
          "OS=='linux'",
          {
            "sources": ["native/linux_v4l2.cc"],
            "cflags_cc!": ["-fno-exceptions"],
            "cflags_cc": ["-std=c++17"]
          },
          {
            "sources": ["native/unsupported.cc"],
            "cflags_cc!": ["-fno-exceptions"],
            "cflags_cc": ["-std=c++17"]
          }
        ]
      ]
    }
  ]
}
