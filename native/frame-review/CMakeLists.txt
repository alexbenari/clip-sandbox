cmake_minimum_required(VERSION 3.25)
project(clip_sandbox_frame_review LANGUAGES CXX)

include(CTest)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
add_compile_options(-Wall -Wextra)

set(FRAME_REVIEW_DEPS_ROOT
    "${CMAKE_CURRENT_SOURCE_DIR}/../../tools/frame-review/.deps"
    CACHE PATH "Resolved frame-review dependency root")
set(FRAME_REVIEW_TRIPLET "x64-mingw-release" CACHE STRING "Pinned vcpkg triplet")

set(VCPKG_ROOT "${FRAME_REVIEW_DEPS_ROOT}/vcpkg-installed/${FRAME_REVIEW_TRIPLET}")
set(BESTSOURCE_ROOT "${FRAME_REVIEW_DEPS_ROOT}/bestsource-install")
set(LIBVLC_ROOT "${FRAME_REVIEW_DEPS_ROOT}/libvlc")
set(LIBVLC_INCLUDE_DIR "${FRAME_REVIEW_DEPS_ROOT}/vlc-source/include")
set(MINGW_RUNTIME_ROOT "C:/cygwin64/usr/x86_64-w64-mingw32/sys-root/mingw/bin")

foreach(required_path
    "${VCPKG_ROOT}/include/nlohmann/json.hpp"
    "${VCPKG_ROOT}/lib/libavcodec.dll.a"
    "${VCPKG_ROOT}/lib/libxxhash.dll.a"
    "${BESTSOURCE_ROOT}/include/bestsource/videosource.h"
    "${BESTSOURCE_ROOT}/lib/libbestsource.dll.a"
    "${LIBVLC_ROOT}/libvlc.dll"
    "${LIBVLC_INCLUDE_DIR}/vlc/vlc.h")
  if(NOT EXISTS "${required_path}")
    message(FATAL_ERROR
      "Pinned frame-review dependency is missing: ${required_path}. Run npm run frame-review:bootstrap.")
  endif()
endforeach()

add_library(frame_review_identity
  common/frame_code.cpp
  common/rational_timestamp.cpp)
target_include_directories(frame_review_identity PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/common")

add_library(frame_review_protocol common/protocol.cpp)
target_include_directories(frame_review_protocol PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/common"
  "${VCPKG_ROOT}/include")

add_library(frame_review_utf8_text common/utf8_text.cpp)
target_include_directories(frame_review_utf8_text PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/common")

add_library(frame_review_json_string common/json_string.cpp)
target_include_directories(frame_review_json_string PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/common")

add_library(frame_review_bestsource_session
  bestsource-gate/prepared_video_session.cpp)
target_include_directories(frame_review_bestsource_session PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/bestsource-gate"
  "${BESTSOURCE_ROOT}/include"
  "${VCPKG_ROOT}/include")

set(BESTSOURCE_LIBRARIES
  "${BESTSOURCE_ROOT}/lib/libbestsource.dll.a"
  "${VCPKG_ROOT}/lib/libswscale.dll.a"
  "${VCPKG_ROOT}/lib/libavformat.dll.a"
  "${VCPKG_ROOT}/lib/libavcodec.dll.a"
  "${VCPKG_ROOT}/lib/libavutil.dll.a"
  "${VCPKG_ROOT}/lib/libxxhash.dll.a")

function(frame_review_wide_console target)
  target_link_options(${target} PRIVATE -municode)
endfunction()

add_executable(bestsource_media_service media-service/bestsource_media_service.cpp)
target_include_directories(bestsource_media_service PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/common"
  "${CMAKE_CURRENT_SOURCE_DIR}/bestsource-gate"
  "${BESTSOURCE_ROOT}/include"
  "${VCPKG_ROOT}/include")
target_link_libraries(bestsource_media_service PRIVATE
  frame_review_bestsource_session frame_review_protocol ${BESTSOURCE_LIBRARIES})

add_executable(libvlc_media_service
  media-service/libvlc_media_service.cpp
  libvlc-gate/libvlc_api.cpp)
target_include_directories(libvlc_media_service PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/common"
  "${CMAKE_CURRENT_SOURCE_DIR}/libvlc-gate"
  "${LIBVLC_INCLUDE_DIR}")
target_link_libraries(libvlc_media_service PRIVATE frame_review_protocol)
# GetProcAddress intentionally converts a FARPROC to each declared LibVLC function type.
target_compile_options(libvlc_media_service PRIVATE -Wno-cast-function-type)
frame_review_wide_console(libvlc_media_service)

add_library(frame_review_operation_runner bestsource-gate/operation_runner.cpp)
target_include_directories(frame_review_operation_runner PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}/bestsource-gate")

add_executable(bestsource_gate bestsource-gate/bestsource_gate.cpp)
target_include_directories(bestsource_gate PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/common"
  "${CMAKE_CURRENT_SOURCE_DIR}/bestsource-gate"
  "${BESTSOURCE_ROOT}/include"
  "${VCPKG_ROOT}/include")
target_link_libraries(bestsource_gate PRIVATE frame_review_identity
  frame_review_bestsource_session frame_review_operation_runner frame_review_utf8_text
  frame_review_json_string
  ${BESTSOURCE_LIBRARIES} psapi)
frame_review_wide_console(bestsource_gate)

foreach(tool direct_libav_baseline media_packet_scan media_sample_signature)
  add_executable(${tool} "bestsource-gate/${tool}.cpp")
  target_include_directories(${tool} PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/common" "${VCPKG_ROOT}/include")
  target_link_libraries(${tool} PRIVATE
    frame_review_utf8_text
    frame_review_json_string
    "${VCPKG_ROOT}/lib/libavformat.dll.a"
    "${VCPKG_ROOT}/lib/libavcodec.dll.a"
    "${VCPKG_ROOT}/lib/libavutil.dll.a")
  frame_review_wide_console(${tool})
endforeach()

add_executable(index_compare bestsource-gate/index_compare.cpp)
target_include_directories(index_compare PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}/common" "${BESTSOURCE_ROOT}/include" "${VCPKG_ROOT}/include")
target_link_libraries(index_compare PRIVATE frame_review_utf8_text frame_review_json_string ${BESTSOURCE_LIBRARIES})
frame_review_wide_console(index_compare)

add_executable(frame_review_common_tests common/common_tests.cpp)
target_link_libraries(frame_review_common_tests PRIVATE frame_review_identity frame_review_utf8_text frame_review_json_string)
add_test(NAME frame_review_common_tests COMMAND frame_review_common_tests)

add_executable(frame_review_protocol_tests common/protocol_tests.cpp)
target_link_libraries(frame_review_protocol_tests PRIVATE frame_review_protocol)
add_test(NAME frame_review_protocol_tests COMMAND frame_review_protocol_tests)

file(GLOB VCPKG_RUNTIME_DLLS "${VCPKG_ROOT}/bin/*.dll")
file(GLOB BESTSOURCE_RUNTIME_DLLS "${BESTSOURCE_ROOT}/bin/*.dll")
set(RUNTIME_ROOT "${CMAKE_BINARY_DIR}/runtime")
set(RUNTIME_STAMP "${RUNTIME_ROOT}/.staged")
add_custom_command(
  OUTPUT "${RUNTIME_STAMP}"
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${RUNTIME_ROOT}/media"
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${RUNTIME_ROOT}/ffmpeg"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          ${VCPKG_RUNTIME_DLLS} ${BESTSOURCE_RUNTIME_DLLS} "${RUNTIME_ROOT}/media"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          ${VCPKG_RUNTIME_DLLS} "${RUNTIME_ROOT}/ffmpeg"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          "${MINGW_RUNTIME_ROOT}/libgcc_s_seh-1.dll"
          "${MINGW_RUNTIME_ROOT}/libstdc++-6.dll"
          "${MINGW_RUNTIME_ROOT}/libwinpthread-1.dll"
          "${RUNTIME_ROOT}/media"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          "${MINGW_RUNTIME_ROOT}/libgcc_s_seh-1.dll"
          "${MINGW_RUNTIME_ROOT}/libstdc++-6.dll"
          "${MINGW_RUNTIME_ROOT}/libwinpthread-1.dll"
          "${RUNTIME_ROOT}/ffmpeg"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          "${VCPKG_ROOT}/tools/ffmpeg/ffmpeg.exe"
          "${VCPKG_ROOT}/tools/ffmpeg/ffprobe.exe"
          "${RUNTIME_ROOT}/ffmpeg"
  COMMAND "${CMAKE_COMMAND}" -E copy_directory "${LIBVLC_ROOT}" "${RUNTIME_ROOT}/libvlc"
  COMMAND "${CMAKE_COMMAND}" -E touch "${RUNTIME_STAMP}"
  DEPENDS
    "${LIBVLC_ROOT}/libvlc.dll"
    "${VCPKG_ROOT}/tools/ffmpeg/ffmpeg.exe"
    "${VCPKG_ROOT}/tools/ffmpeg/ffprobe.exe"
    "${MINGW_RUNTIME_ROOT}/libgcc_s_seh-1.dll"
    "${MINGW_RUNTIME_ROOT}/libstdc++-6.dll"
    "${MINGW_RUNTIME_ROOT}/libwinpthread-1.dll"
    ${VCPKG_RUNTIME_DLLS}
    ${BESTSOURCE_RUNTIME_DLLS}
  VERBATIM)
add_custom_target(frame_review_runtime ALL DEPENDS "${RUNTIME_STAMP}")
