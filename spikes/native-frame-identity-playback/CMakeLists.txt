cmake_minimum_required(VERSION 3.25)
project(native_frame_identity_playback LANGUAGES CXX)

include(CTest)

add_library(frame_identity_common
  native/common/frame_code.cpp
  native/common/rational_timestamp.cpp
)
target_include_directories(frame_identity_common PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/native/common")

set(NLOHMANN_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/.deps/vcpkg-installed/x64-mingw-release/include")
add_library(frame_bridge_protocol native/common/protocol.cpp)
target_include_directories(frame_bridge_protocol PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/native/common"
  "${NLOHMANN_INCLUDE_DIR}"
)

add_executable(frame_identity_common_tests native/common/common_tests.cpp)
target_link_libraries(frame_identity_common_tests PRIVATE frame_identity_common)
add_test(NAME frame_identity_common_tests COMMAND frame_identity_common_tests)

set(LIBVLC_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.deps/libvlc" CACHE PATH "Pinned LibVLC root")
set(LIBVLC_SOURCE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.deps/vlc-source" CACHE PATH "Pinned VLC source root")
set(LIBVLC_INCLUDE_DIR "${LIBVLC_SOURCE_ROOT}/include")

if(NOT EXISTS "${LIBVLC_INCLUDE_DIR}/vlc/vlc.h")
  message(FATAL_ERROR "Pinned LibVLC headers are missing. Run scripts/bootstrap-native.ps1 first.")
endif()

add_executable(libvlc_api_probe native/libvlc-gate/api_probe.cpp)
target_include_directories(libvlc_api_probe PRIVATE "${LIBVLC_INCLUDE_DIR}")

add_executable(libvlc_gate
  native/libvlc-gate/gate_main.cpp
  native/libvlc-gate/callback_state.cpp
  native/libvlc-gate/libvlc_api.cpp
)
target_include_directories(libvlc_gate PRIVATE
  "${LIBVLC_INCLUDE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/native/common"
)
target_link_libraries(libvlc_gate PRIVATE frame_identity_common)

add_executable(libvlc_texture_probe
  native/libvlc-gate/texture_probe.cpp
  native/libvlc-gate/libvlc_api.cpp
)
target_include_directories(libvlc_texture_probe PRIVATE
  "${LIBVLC_INCLUDE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/native/libvlc-gate"
)

add_executable(libvlc_media_service
  native/media-service/libvlc_media_service.cpp
  native/libvlc-gate/libvlc_api.cpp
)
target_include_directories(libvlc_media_service PRIVATE
  "${LIBVLC_INCLUDE_DIR}"
  "${CMAKE_CURRENT_SOURCE_DIR}/native/libvlc-gate"
)
target_link_libraries(libvlc_media_service PRIVATE frame_bridge_protocol)

set_target_properties(libvlc_api_probe PROPERTIES
  VS_DEBUGGER_ENVIRONMENT "PATH=${LIBVLC_ROOT};%PATH%\nVLC_PLUGIN_PATH=${LIBVLC_ROOT}/plugins"
)
set_target_properties(libvlc_media_service PROPERTIES
  VS_DEBUGGER_ENVIRONMENT "PATH=${LIBVLC_ROOT};%PATH%\nVLC_PLUGIN_PATH=${LIBVLC_ROOT}/plugins"
)
