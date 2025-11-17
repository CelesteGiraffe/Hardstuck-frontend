#pragma once
#include <cstddef>
#include <cstdarg>

// Provide a global ImGuiContext type so the plugin's forward declarations and
// reinterpret_casts between uintptr_t and ImGuiContext* are compatible.
struct ImGuiContext {};

namespace ImGui {
    // Alias the namespace ImGuiContext to the global one so both refer to same type.
    using ImGuiContext = ::ImGuiContext;

    inline ImGuiContext* GetCurrentContext() { return nullptr; }
    inline void SetCurrentContext(ImGuiContext*) {}

    inline void ShowDemoWindow(bool*) {}

    // Begin/End
    inline bool Begin(const char*, bool* = nullptr, int = 0) { return true; }
    inline void End() {}

    // Simple text helpers. Provide variadic template to accept format-like calls used in the plugin.
    template<typename... Args>
    inline void TextWrapped(const char*, Args...) {}

    inline void TextUnformatted(const char*) {}

    inline bool Button(const char*) { return false; }
    inline bool Checkbox(const char*, bool*) { return false; }
    inline void SameLine() {}
    inline bool InputText(const char*, char*, std::size_t) { return false; }
    inline void Spacing() {}

    constexpr int ImGuiWindowFlags_AlwaysAutoResize = 1;
}

// Some code refers to ImGuiWindowFlags_AlwaysAutoResize without the ImGui:: prefix.
// Expose it in the global namespace as well.
constexpr int ImGuiWindowFlags_AlwaysAutoResize = ImGui::ImGuiWindowFlags_AlwaysAutoResize;
