#pragma once

#include "bakkesmod/plugin/bakkesmodplugin.h"
#include "bakkesmod/plugin/PluginSettingsWindow.h"
#include "bakkesmod/plugin/PluginWindow.h"

#include "ApiClient.h"

#include <chrono>
#include <future>
#include <mutex>
#include <string>
#include <vector>

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
    std::string BuildMatchPayload(const ServerWrapper& server) const;
    std::string SerializeScoreboard(const ServerWrapper& server) const;
    std::string SerializeTeams(const ServerWrapper& server) const;
    std::string PlaylistNameFromServer(const ServerWrapper& server) const;
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
