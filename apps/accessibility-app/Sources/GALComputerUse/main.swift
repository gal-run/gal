import Cocoa
import CoreGraphics
import Foundation

// MARK: - Result Types

struct ErrorResult: Codable {
    let error: String
}

struct StatusResult: Codable {
    let status: String
    let message: String
}

struct ScreenshotResult: Codable {
    let image: String
    let width: Int
    let height: Int
}

struct AppStateResult: Codable {
    let app: String
    let root: AccessibilityNode
}

struct AccessibilityNode: Codable {
    let index: Int
    let role: String
    let title: String?
    let value: String?
    let position: [Double]?
    let size: [Double]?
    let children: [AccessibilityNode]?
}

// MARK: - Helper Functions

func encodeJSON<T: Encodable>(_ value: T) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    guard let data = try? encoder.encode(value) else { return "{}" }
    return String(data: data, encoding: .utf8) ?? "{}"
}

// MARK: - Accessibility Helpers

func getAXValueAsString(_ element: AXUIElement, _ attribute: String) -> String? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success else { return nil }
    return value as? String
}

func getAXValueAsPoint(_ element: AXUIElement, _ attribute: String) -> CGPoint? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let v = value else { return nil }
    let pointValue = v as! AXValue
    var point = CGPoint()
    guard AXValueGetValue(pointValue, .cgPoint, &point) else { return nil }
    return point
}

func getAXValueAsSize(_ element: AXUIElement, _ attribute: String) -> CGSize? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let v = value else { return nil }
    let sizeValue = v as! AXValue
    var size = CGSize()
    guard AXValueGetValue(sizeValue, .cgSize, &size) else { return nil }
    return size
}

func getAXChildren(_ element: AXUIElement) -> [AXUIElement]? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value)
    guard result == .success, let children = value as? [AXUIElement] else { return nil }
    return children
}

// MARK: - Build Accessibility Tree

func buildAccessibilityTree(_ element: AXUIElement, index: inout Int) -> AccessibilityNode {
    let currentIndex = index
    index += 1
    
    let role = getAXValueAsString(element, kAXRoleAttribute as String) ?? "unknown"
    let title = getAXValueAsString(element, kAXTitleAttribute as String)
    let value = getAXValueAsString(element, kAXValueAttribute as String)
    let position = getAXValueAsPoint(element, kAXPositionAttribute as String).map { [Double($0.x), Double($0.y)] }
    let size = getAXValueAsSize(element, kAXSizeAttribute as String).map { [Double($0.width), Double($0.height)] }
    
    var childNodes: [AccessibilityNode]? = nil
    if let children = getAXChildren(element), !children.isEmpty {
        childNodes = children.map { buildAccessibilityTree($0, index: &index) }
    }
    
    return AccessibilityNode(
        index: currentIndex,
        role: role,
        title: title,
        value: value,
        position: position,
        size: size,
        children: childNodes
    )
}

// MARK: - Actions

func getAppState(appName: String?) -> String {
    let app: NSRunningApplication?
    if let name = appName {
        app = NSRunningApplication.runningApplications(withBundleIdentifier: name).first
            ?? NSWorkspace.shared.runningApplications.first { $0.localizedName == name }
    } else {
        app = NSWorkspace.shared.frontmostApplication
    }
    
    guard let app = app else {
        return encodeJSON(ErrorResult(error: "Application not found: \(appName ?? "frontmost")"))
    }
    
    let pid = app.processIdentifier
    let appElement = AXUIElementCreateApplication(pid)
    var index = 0
    let tree = buildAccessibilityTree(appElement, index: &index)
    return encodeJSON(AppStateResult(app: app.localizedName ?? "unknown", root: tree))
}

func takeScreenshot(window: String = "screen", outputPath: String? = nil) -> String {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    var args: [String] = ["-x"]
    
    switch window {
    case "window": args.append("-w")
    case "selection": args.append("-i")
    default: break
    }
    
    if let path = outputPath {
        args.append(path)
        task.arguments = args
        do {
            try task.run()
            task.waitUntilExit()
            return encodeJSON(StatusResult(status: "success", message: "Screenshot saved to \(path)"))
        } catch {
            return encodeJSON(ErrorResult(error: "Failed to take screenshot: \(error.localizedDescription)"))
        }
    } else {
        let tempPath = "/tmp/gal-screenshot-\(UUID().uuidString).png"
        args.append(tempPath)
        task.arguments = args
        do {
            try task.run()
            task.waitUntilExit()
            let data = try Data(contentsOf: URL(fileURLWithPath: tempPath))
            let base64 = data.base64EncodedString()
            try? FileManager.default.removeItem(atPath: tempPath)
            return encodeJSON(ScreenshotResult(image: base64, width: 0, height: 0))
        } catch {
            return encodeJSON(ErrorResult(error: "Failed to take screenshot: \(error.localizedDescription)"))
        }
    }
}

// Human-like cursor animation: instead of teleporting the pointer to the
// target and clicking (robotic in a recording), glide it along an ease-in-out
// path from the current position over a short duration — many small mouseMoved
// events. This is the same harness-layer trick OpenAI's CUA/Operator uses;
// the model only says "click x,y", the harness makes the motion look human.
// Set GAL_CU_INSTANT=1 to disable (fast path for headless QA automation).
func smoothMoveTo(x: Double, y: Double, eventSource: CGEventSource?) {
    if ProcessInfo.processInfo.environment["GAL_CU_INSTANT"] == "1" {
        CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved,
                mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)?.post(tap: .cghidEventTap)
        return
    }
    let start = CGEvent(source: nil)?.location ?? CGPoint(x: x, y: y)
    let dx = x - Double(start.x), dy = y - Double(start.y)
    let dist = (dx * dx + dy * dy).squareRoot()
    if dist < 1 { return }
    let steps = max(12, min(64, Int(dist / 12)))  // scale steps with distance
    for i in 1...steps {
        let t = Double(i) / Double(steps)
        let e = t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2  // ease-in-out cubic
        let px = Double(start.x) + dx * e
        let py = Double(start.y) + dy * e
        CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved,
                mouseCursorPosition: CGPoint(x: px, y: py), mouseButton: .left)?.post(tap: .cghidEventTap)
        usleep(6000)  // ~6ms/step → ~70–380ms glide depending on distance
    }
}

func clickAt(x: Double, y: Double, button: String = "left", clickCount: Int = 1) -> String {
    let mouseButton: CGMouseButton
    switch button.lowercased() {
    case "right": mouseButton = .right
    case "middle": mouseButton = .center
    default: mouseButton = .left
    }

    let eventSource = CGEventSource(stateID: .hidSystemState)
    smoothMoveTo(x: x, y: y, eventSource: eventSource)  // human-like glide to target
    usleep(40000)
    
    let downType: CGEventType = mouseButton == .right ? .rightMouseDown : .leftMouseDown
    let upType: CGEventType = mouseButton == .right ? .rightMouseUp : .leftMouseUp
    
    for _ in 0..<clickCount {
        let downEvent = CGEvent(mouseEventSource: eventSource, mouseType: downType, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: mouseButton)
        downEvent?.post(tap: .cghidEventTap)
        usleep(50000)
        let upEvent = CGEvent(mouseEventSource: eventSource, mouseType: upType, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: mouseButton)
        upEvent?.post(tap: .cghidEventTap)
        if clickCount > 1 { usleep(100000) }
    }
    return encodeJSON(StatusResult(status: "success", message: "Clicked at (\(x), \(y))"))
}

func typeText(_ text: String) -> String {
    let eventSource = CGEventSource(stateID: .hidSystemState)
    for char in text {
        let chars = Array(String(char).utf16)
        var event = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: true)
        event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: chars)
        event?.post(tap: .cghidEventTap)
        usleep(10000)
        event = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: false)
        event?.keyboardSetUnicodeString(stringLength: 1, unicodeString: chars)
        event?.post(tap: .cghidEventTap)
    }
    return encodeJSON(StatusResult(status: "success", message: "Typed \(text.count) characters"))
}

func pressKey(key: String, modifiers: [String] = []) -> String {
    let keyMap: [String: CGKeyCode] = [
        "enter": 0x24, "tab": 0x30, "escape": 0x35, "space": 0x31, "backspace": 0x33, "delete": 0x75,
        "arrowUp": 0x7E, "arrowDown": 0x7D, "arrowLeft": 0x7B, "arrowRight": 0x7C,
        "f1": 0x7A, "f2": 0x78, "f3": 0x63, "f4": 0x76, "f5": 0x60, "f6": 0x61,
        "f7": 0x62, "f8": 0x64, "f9": 0x65, "f10": 0x6D, "f11": 0x67, "f12": 0x6F,
    ]
    
    guard let keyCode = keyMap[key.lowercased()] ?? keyMap[key] else {
        return encodeJSON(ErrorResult(error: "Unknown key: \(key)"))
    }
    
    let eventSource = CGEventSource(stateID: .hidSystemState)
    var flags: CGEventFlags = []
    for mod in modifiers {
        switch mod.lowercased() {
        case "command", "cmd": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "option", "alt": flags.insert(.maskAlternate)
        case "control", "ctrl": flags.insert(.maskControl)
        default: break
        }
    }
    
    let downEvent = CGEvent(keyboardEventSource: eventSource, virtualKey: keyCode, keyDown: true)
    downEvent?.flags = flags
    downEvent?.post(tap: .cghidEventTap)
    usleep(50000)
    let upEvent = CGEvent(keyboardEventSource: eventSource, virtualKey: keyCode, keyDown: false)
    upEvent?.flags = flags
    upEvent?.post(tap: .cghidEventTap)
    return encodeJSON(StatusResult(status: "success", message: "Pressed key: \(key)"))
}

func moveMouse(x: Double, y: Double) -> String {
    let eventSource = CGEventSource(stateID: .hidSystemState)
    smoothMoveTo(x: x, y: y, eventSource: eventSource)  // human-like glide
    return encodeJSON(StatusResult(status: "success", message: "Moved to (\(x), \(y))"))
}

func scroll(scrollX: Double = 0, scrollY: Double = 0, atX: Double? = nil, atY: Double? = nil) -> String {
    let eventSource = CGEventSource(stateID: .hidSystemState)
    if let x = atX, let y = atY {
        let moveEvent = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)
        moveEvent?.post(tap: .cghidEventTap)
        usleep(50000)
    }
    let event = CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 2, wheel1: Int32(scrollY), wheel2: Int32(scrollX), wheel3: 0)
    event?.post(tap: CGEventTapLocation.cghidEventTap)
    return encodeJSON(StatusResult(status: "success", message: "Scrolled by (\(scrollX), \(scrollY))"))
}

// MARK: - IPC Server

let socketPath = "/tmp/gal-accessibility-app.sock"

func handleClient(_ client: FileHandle) {
    let data = client.readDataToEndOfFile()
    guard let input = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let action = input["action"] as? String else {
        let error = ErrorResult(error: "Invalid command format")
        client.write(encodeJSON(error).data(using: .utf8)!)
        client.closeFile()
        return
    }
    
    let result: String
    switch action {
    case "get_app_state":
        result = getAppState(appName: input["app"] as? String)
    case "screenshot":
        result = takeScreenshot(window: input["window"] as? String ?? "screen", outputPath: input["output_path"] as? String)
    case "click":
        if let x = input["x"] as? Double, let y = input["y"] as? Double {
            result = clickAt(x: x, y: y, button: input["button"] as? String ?? "left", clickCount: input["click_count"] as? Int ?? 1)
        } else {
            result = encodeJSON(ErrorResult(error: "click requires x and y coordinates"))
        }
    case "type":
        result = typeText(input["text"] as? String ?? "")
    case "key":
        result = pressKey(key: input["key"] as? String ?? "", modifiers: input["modifiers"] as? [String] ?? [])
    case "move":
        if let x = input["x"] as? Double, let y = input["y"] as? Double {
            result = moveMouse(x: x, y: y)
        } else {
            result = encodeJSON(ErrorResult(error: "move requires x and y coordinates"))
        }
    case "scroll":
        result = scroll(scrollX: input["scroll_x"] as? Double ?? 0, scrollY: input["scroll_y"] as? Double ?? 0, atX: input["at_x"] as? Double, atY: input["at_y"] as? Double)
    case "ping":
        result = encodeJSON(StatusResult(status: "ok", message: "GAL Computer Use helper is running"))
    default:
        result = encodeJSON(ErrorResult(error: "Unknown action: \(action)"))
    }
    
    client.write(result.data(using: .utf8)!)
    client.closeFile()
}

// MARK: - Main

let stderr = FileHandle.standardError
stderr.write("[GAL Computer Use] Starting helper...\n".data(using: .utf8)!)

let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
let options = [promptKey: true] as CFDictionary
let trusted = AXIsProcessTrustedWithOptions(options)

if !trusted {
    let error = ErrorResult(error: """
Accessibility permissions required.

GAL Computer Use needs accessibility access to control your mouse, keyboard, and read UI elements.

Grant permission to "GAL Computer Use" in System Settings > Privacy & Security > Accessibility.
""")
    print(encodeJSON(error))
    exit(1)
}

stderr.write("[GAL Computer Use] Accessibility verified, listening on \(socketPath)\n".data(using: .utf8)!)
try? FileManager.default.removeItem(atPath: socketPath)

let socketFD = socket(AF_UNIX, SOCK_STREAM, 0)
guard socketFD >= 0 else {
    stderr.write("[GAL Computer Use] Failed to create socket\n".data(using: .utf8)!)
    exit(1)
}

var addr = sockaddr_un()
addr.sun_family = sa_family_t(AF_UNIX)
addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
strlcpy(&addr.sun_path.0, socketPath, Int(MemoryLayout.size(ofValue: addr.sun_path)))

let bindResult = withUnsafePointer(to: &addr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockPtr in
        Darwin.bind(socketFD, sockPtr, socklen_t(MemoryLayout<sockaddr_un>.size))
    }
}

guard bindResult == 0 else {
    stderr.write("[GAL Computer Use] Failed to bind socket\n".data(using: .utf8)!)
    exit(1)
}

guard listen(socketFD, 5) == 0 else {
    stderr.write("[GAL Computer Use] Failed to listen\n".data(using: .utf8)!)
    exit(1)
}

while true {
    var clientAddr = sockaddr()
    var clientAddrLen = socklen_t(MemoryLayout<sockaddr>.size)
    let clientFD = accept(socketFD, &clientAddr, &clientAddrLen)
    guard clientFD >= 0 else { continue }
    let client = FileHandle(fileDescriptor: clientFD)
    handleClient(client)
}
