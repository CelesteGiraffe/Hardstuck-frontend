#pragma once

// Small wrapper that exposes a stable set of ImGui functions used by the plugin.
// If a real ImGui header is available, forward to it; otherwise provide
// minimal no-op fallbacks so the plugin can compile.

#if defined(RTJ_USE_REAL_IMGUI)
#include <imgui.h>
namespace RTJ {
    inline void TextWrapped(const char* fmt) { ImGui::TextWrapped(fmt); }
    inline void TextWrapped(const char* fmt, const char* s) { ImGui::TextWrapped(fmt, s); }
    inline void TextUnformatted(const char* text) { ImGui::TextUnformatted(text); }
    inline void BulletText(const char* fmt, const char* s) { ImGui::BulletText(fmt, s); }
    inline void Spacing() { ImGui::Spacing(); }
    inline void SameLine() { ImGui::SameLine(); }
    inline bool Button(const char* label) { return ImGui::Button(label); }
    inline bool InputText(const char* label, char* buf, size_t buf_size) { return ImGui::InputText(label, buf, buf_size); }
}
#else
#include <cstddef>
#include <string>
namespace RTJ {
    inline void TextWrapped(const char* /*fmt*/) {}
    inline void TextWrapped(const char* /*fmt*/, const char* /*s*/) {}
    inline void TextUnformatted(const char* /*text*/) {}
    inline void BulletText(const char* /*fmt*/, const char* /*s*/) {}
    inline void Spacing() {}
    inline void SameLine() {}
    inline bool Button(const char* /*label*/) { return false; }
    inline bool InputText(const char* /*label*/, char* /*buf*/, size_t /*buf_size*/) { return false; }
}
#endif

// Create a namespace alias so existing code that uses `ImGui::` continues to work
#if !defined(RTJ_USE_REAL_IMGUI)
namespace ImGui = RTJ;
#endif
