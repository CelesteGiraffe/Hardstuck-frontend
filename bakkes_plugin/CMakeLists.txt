cmake_minimum_required(VERSION 3.18)
project(RLTrainingJournalPlugin)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Export compile commands for language servers (helps clangd/linters find include paths)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(DEFINED ENV{BAKKESMODSDK})
    set(BAKKESMOD_SDK $ENV{BAKKESMODSDK})
else()
    # Fall back to the included `BakkesModSDK-master` folder in the repository if present
    set(FALLBACK_SDK "${CMAKE_CURRENT_SOURCE_DIR}/../BakkesModSDK-master")
    if(EXISTS ${FALLBACK_SDK})
        message(STATUS "BAKKESMODSDK not set; using bundled SDK at: ${FALLBACK_SDK}")
        set(BAKKESMOD_SDK ${FALLBACK_SDK})
    else()
        message(FATAL_ERROR "Set the BAKKESMODSDK environment variable to the root of the BakkesMod Plugin SDK, or include BakkesModSDK-master in the repo.")
    endif()
endif()

# ImGui requirement: prefer real ImGui. If not found and RTJ_REQUIRE_IMGUI is ON,
# fail with a helpful message telling the developer how to provide ImGui.
option(RTJ_REQUIRE_IMGUI "Fail the build when ImGui headers aren't available" ON)

# Search common locations (system include dirs, bundled third_party, or the SDK)
find_path(IMGUI_INCLUDE_DIR
    NAMES imgui.h
    PATHS
        ${BAKKESMOD_SDK}/include
        ${CMAKE_CURRENT_SOURCE_DIR}/third_party/imgui
        /usr/include
        /usr/local/include
)

if (IMGUI_INCLUDE_DIR)
    message(STATUS "Found ImGui headers in: ${IMGUI_INCLUDE_DIR}")
    # We apply include dir and compile definitions to the target after it is created
else()
        if (RTJ_REQUIRE_IMGUI)
                message(FATAL_ERROR "ImGui headers not found. To fix, either:
    - Install Dear ImGui headers and make them discoverable (e.g. /usr/include or /usr/local/include),
    - Place ImGui headers into 'bakkes_plugin/third_party/imgui' (put imgui.h there),
    - Or set the CMake variable IMGUI_INCLUDE_DIR to the directory that contains imgui.h.

Suggested commands:
    - cmake -DIMGUI_INCLUDE_DIR=path/to/imgui -S . -B build
    - or clone Dear ImGui into 'bakkes_plugin/third_party/imgui' and re-run cmake

If you prefer to allow the build to use local fallback wrappers instead, re-run cmake with:
    -DRTJ_REQUIRE_IMGUI=OFF
")
        else()
                message(WARNING "ImGui headers not found; using local fallback wrappers. This may not reflect runtime behavior.")
        endif()
endif()

add_library(${PROJECT_NAME} SHARED
    src/ApiClient.cpp
    src/RLTrainingJournalPlugin.cpp
    src/DiagnosticLogger.cpp
)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${BAKKESMOD_SDK}/include
    include
)

if (IMGUI_INCLUDE_DIR)
    target_include_directories(${PROJECT_NAME} PRIVATE "${IMGUI_INCLUDE_DIR}")
    target_compile_definitions(${PROJECT_NAME} PRIVATE RTJ_USE_REAL_IMGUI)
    # If the ImGui sources are present in the same folder, compile them into the plugin
    if (EXISTS "${IMGUI_INCLUDE_DIR}/imgui.cpp")
        target_sources(${PROJECT_NAME} PRIVATE
            "${IMGUI_INCLUDE_DIR}/imgui.cpp"
            "${IMGUI_INCLUDE_DIR}/imgui_draw.cpp"
            "${IMGUI_INCLUDE_DIR}/imgui_widgets.cpp"
            "${IMGUI_INCLUDE_DIR}/imgui_tables.cpp"
        )
        # Optionally include demo file if you want the demo UI available
        if (EXISTS "${IMGUI_INCLUDE_DIR}/imgui_demo.cpp")
            target_sources(${PROJECT_NAME} PRIVATE "${IMGUI_INCLUDE_DIR}/imgui_demo.cpp")
        endif()
    endif()
endif()

if (WIN32)
    target_link_directories(${PROJECT_NAME} PRIVATE ${BAKKESMOD_SDK}/lib)
    # Newer SDKs ship with 'pluginsdk.lib' instead of 'BakkesMod.lib'
    if(EXISTS ${BAKKESMOD_SDK}/lib/pluginsdk.lib)
        target_link_libraries(${PROJECT_NAME} PRIVATE pluginsdk Winhttp)
    else()
        target_link_libraries(${PROJECT_NAME} PRIVATE BakkesMod Winhttp)
    endif()
endif()

set_target_properties(${PROJECT_NAME} PROPERTIES
    OUTPUT_NAME ${PROJECT_NAME}
)

# Post-build: automatically copy runtime files into the repository `deploy/` folder
# Uses PowerShell on Windows to run `scripts/deploy.ps1`. This makes it easy to
# keep only the minimal artifacts needed for testing.
if (WIN32)
    # Prefer PowerShell Core (pwsh) if available, otherwise fall back to Windows PowerShell
    find_program(PWSH_EXECUTABLE pwsh)
    if (PWSH_EXECUTABLE)
        set(POWERSHELL_EXEC "${PWSH_EXECUTABLE}")
    else()
        find_program(WIN_POWERSHELL_EXECUTABLE powershell.exe)
        if (WIN_POWERSHELL_EXECUTABLE)
            set(POWERSHELL_EXEC "${WIN_POWERSHELL_EXECUTABLE}")
        endif()
    endif()

    if (NOT DEFINED POWERSHELL_EXEC)
        message(WARNING "PowerShell not found on PATH; skipping post-build deploy script.")
    else()
        add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
            COMMAND ${POWERSHELL_EXEC} -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${CMAKE_CURRENT_SOURCE_DIR}/scripts/deploy.ps1" -Source "$<TARGET_FILE:${PROJECT_NAME}>" -Patterns "$<TARGET_FILE_NAME:${PROJECT_NAME}>"
            COMMENT "Copy runtime plugin files into bakkes_plugin/deploy/ (post-build)"
        )
    endif()
endif()

# For non-Windows systems (macOS / Linux), attempt to run the POSIX deploy script
if (NOT WIN32)
    find_program(BASH_EXECUTABLE bash)
    if (BASH_EXECUTABLE)
        set(SHELL_EXEC "${BASH_EXECUTABLE}")
    else()
        find_program(SH_EXECUTABLE sh)
        if (SH_EXECUTABLE)
            set(SHELL_EXEC "${SH_EXECUTABLE}")
        endif()
    endif()

    if (NOT DEFINED SHELL_EXEC)
        message(WARNING "sh/bash not found on PATH; skipping non-Windows post-build deploy script.")
    else()
        add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
            COMMAND ${SHELL_EXEC} "${CMAKE_CURRENT_SOURCE_DIR}/scripts/deploy.sh" "$<TARGET_FILE_DIR:${PROJECT_NAME}>" "$<TARGET_FILE_NAME:${PROJECT_NAME}>"
            COMMENT "Copy runtime plugin files into bakkes_plugin/deploy/ (post-build, non-Windows)"
        )
    endif()
endif()
