cmake_minimum_required(VERSION 3.18)
project(RLTrainingJournalPlugin)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Export compile commands for language servers (helps clangd/linters find include paths)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT DEFINED ENV{BAKKESMODSDK})
    message(FATAL_ERROR "Set the BAKKESMODSDK environment variable to the root of the BakkesMod Plugin SDK.")
endif()

set(BAKKESMOD_SDK $ENV{BAKKESMODSDK})

add_library(${PROJECT_NAME} SHARED
    src/ApiClient.cpp
    src/RLTrainingJournalPlugin.cpp
)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${BAKKESMOD_SDK}/include
    include
)

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
            COMMAND ${POWERSHELL_EXEC} -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${CMAKE_CURRENT_SOURCE_DIR}/scripts/deploy.ps1" -Source "$<TARGET_FILE_DIR:${PROJECT_NAME}>" -Patterns "$<TARGET_FILE_NAME:${PROJECT_NAME}>"
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
