#pragma once

// Include the real BakkesMod SDK headers when building on Windows (where the
// SDK is expected to be installed). For local development on macOS or when
// the SDK isn't available, use lightweight stubs so the editor and linter
// won't produce include errors.
#if defined(_WIN32) && __has_include("bakkesmod/plugin/bakkesmodplugin.h")
#include "bakkesmod/plugin/bakkesmodplugin.h"
#include "bakkesmod/plugin/PluginSettingsWindow.h"
#include "bakkesmod/plugin/PluginWindow.h"
#include "bakkesmod/plugin/compat.h"
#else
#include "bakkesmod_stubs.h"
#endif

#include "ApiClient.h"

#include <chrono>
#include <future>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

// Forward declarations from the BakkesMod SDK wrappers used in method signatures.
// Keep the header lightweight and avoid pulling in heavy wrapper headers here.
class ServerWrapper;

class RLTrainingJournalPlugin final : public BakkesMod::Plugin::BakkesModPlugin,
                                     public SettingsWindowBase,
                                     public PluginWindowBase
{
public:
    void onLoad() override;
    void onUnload() override;

    void RenderSettings() override;
    void Render() override;
    std::string GetPluginName() override;

private:
    void RegisterCVars();
    void HookMatchEvents();
    void HandleGameEnd(std::string eventName);
    void HandleReplayRecorded(std::string eventName);
    std::string BuildMatchPayload(ServerWrapper server) const;
    std::string SerializeScoreboard(ServerWrapper server) const;
    std::string SerializeTeams(ServerWrapper server) const;
    std::string PlaylistNameFromServer(ServerWrapper server) const;
    std::string FormatTimestamp(const std::chrono::system_clock::time_point& timePoint) const;
    std::string Escape(const std::string& value) const;
    void DispatchPayloadAsync(const std::string& endpoint, const std::string& body);
    void CleanupFinishedRequests();

    std::unique_ptr<ApiClient> apiClient;
    mutable std::mutex requestMutex;
    std::vector<std::future<void>> pendingRequests;
    std::string lastResponseMessage;
    std::string lastErrorMessage;
};
