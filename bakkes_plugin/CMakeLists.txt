cmake_minimum_required(VERSION 3.18)
project(RLTrainingJournalPlugin)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

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
    target_link_libraries(${PROJECT_NAME} PRIVATE BakkesMod Winhttp)
endif()

set_target_properties(${PROJECT_NAME} PROPERTIES
    OUTPUT_NAME ${PROJECT_NAME}
)
