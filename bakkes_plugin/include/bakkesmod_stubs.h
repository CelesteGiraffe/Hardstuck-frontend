// Minimal BakkesMod SDK stubs for local development (non-Windows)
// These provide only the small set of types and methods referenced by
// RLTrainingJournalPlugin so the editor / linter can resolve includes.
#pragma once

#include <functional>
#include <string>
#include <vector>

namespace BakkesMod {
namespace Plugin {

class CVarWrapper {
public:
    CVarWrapper() = default;
    std::string getStringValue() const { return std::string(); }
    int getIntValue() const { return 0; }
    void addOnValueChanged(std::function<void(std::string, CVarWrapper)> /*fn*/) {}
};

class CVarManagerWrapper {
public:
    CVarWrapper getCvar(const std::string&) const { return CVarWrapper(); }
    CVarWrapper registerCvar(const std::string&, const std::string&, const std::string&) { return CVarWrapper(); }
    void registerNotifier(const std::string&, std::function<void(std::vector<std::string>)>, const std::string&, int) {}
    void log(const std::string&) const {}
};

class BakkesModPlugin {
public:
    virtual ~BakkesModPlugin() = default;
    CVarManagerWrapper* cvarManager = nullptr; // real SDK provides this
    void* gameWrapper = nullptr; // opaque in stub; RLTrainingJournalPlugin expects this member
};

} // namespace Plugin
} // namespace BakkesMod

// Minimal wrapper types used by the plugin implementation
class UnrealStringWrapper {
public:
    bool IsNull() const { return true; }
    std::string ToString() const { return std::string(); }
};

template <typename T>
class ArrayWrapper {
public:
    int Count() const { return 0; }
    T Get(int) const { return T(); }
};

class PlaylistWrapper {
public:
    UnrealStringWrapper GetPlaylistName() const { return UnrealStringWrapper(); }
    int GetPlaylistId() const { return 0; }
};

class TeamWrapper {
public:
    int GetTeamNum() const { return 0; }
    int GetScore() const { return 0; }
};

class PriWrapper {
public:
    UnrealStringWrapper GetPlayerName() const { return UnrealStringWrapper(); }
    int GetTeamNum() const { return 0; }
    int GetMatchScore() const { return 0; }
    int GetGoals() const { return 0; }
    int GetAssists() const { return 0; }
    int GetSaves() const { return 0; }
    int GetShots() const { return 0; }
};

class CarWrapper {
public:
    PriWrapper GetPRI() const { return PriWrapper(); }
};

class ServerWrapper {
public:
    PlaylistWrapper GetPlaylist() const { return PlaylistWrapper(); }
    ArrayWrapper<TeamWrapper> GetTeams() const { return ArrayWrapper<TeamWrapper>(); }
    ArrayWrapper<CarWrapper> GetCars() const { return ArrayWrapper<CarWrapper>(); }
};

class MMRWrapper {
public:
    float GetPlayerMMR(const void*, int) const { return 0.0f; }
};

class UniqueIDWrapper {};

// Lightweight GameWrapper stub with the minimal API used by the plugin
class GameWrapper {
public:
    ServerWrapper GetOnlineGame() const { return ServerWrapper(); }
    ServerWrapper GetGameEventAsServer() const { return ServerWrapper(); }
    bool IsInOnlineGame() const { return false; }
    bool IsInReplay() const { return false; }
    MMRWrapper GetMMRWrapper() const { return MMRWrapper(); }
    UniqueIDWrapper GetUniqueID() const { return UniqueIDWrapper(); }

    // Hooking APIs: no-op in stubs
    template <typename TCaller, typename TFunc>
    void HookEventWithCallerPost(const std::string&, TFunc) {}

    template <typename TFunc>
    void HookEventPost(const std::string&, TFunc) {}
};

// Small permission constant placeholder
#ifndef PERMISSION_ALL
#define PERMISSION_ALL 0
#endif
