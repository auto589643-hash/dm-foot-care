from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / ".test-deps"))

from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:4173"

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
        args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    page.set_default_timeout(10000)
    page.goto(BASE_URL, wait_until="domcontentloaded", timeout=15000)
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="domcontentloaded")

    username = page.get_by_label("ชื่อผู้ใช้")
    username.focus()
    page.keyboard.press("Tab")
    assert page.evaluate("document.activeElement && document.activeElement.id") == "pin"
    page.keyboard.press("Tab")
    assert page.evaluate("document.activeElement && document.activeElement.getAttribute('type')") == "submit"
    page.keyboard.press("Enter")
    page.get_by_role("heading", name="สวัสดี คุณสมใจ").wait_for()

    profile_button = page.locator(".profile-button")
    profile_button.focus()
    page.keyboard.press("Enter")
    page.get_by_role("menu").wait_for()
    page.keyboard.press("Escape")
    assert not page.get_by_role("menu").is_visible()

    # A 200% browser zoom is equivalent to roughly half the CSS viewport width.
    page.set_viewport_size({"width": 195, "height": 844})
    page.wait_for_timeout(100)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.get_by_role("button", name="ตรวจเท้า", exact=True).is_visible()
    browser.close()

print("Accessibility smoke test passed")
