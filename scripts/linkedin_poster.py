#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from urllib.parse import urljoin
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv
from playwright.sync_api import (
    BrowserContext,
    Error as PlaywrightError,
    Locator,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_PATHS = (
    REPO_ROOT / ".env",
    REPO_ROOT / "apps" / "worker" / ".env",
    REPO_ROOT / "apps" / "web" / ".env.local",
)
DEFAULT_STORAGE_STATE_PATH = REPO_ROOT / ".linkedin_storage_state.json"
DEFAULT_SCREENSHOT_DIR = REPO_ROOT / "artifacts" / "linkedin"
DEFAULT_COMPANY_ADMIN_URL = "https://www.linkedin.com/company/112822225/admin/dashboard/"
GOTO_TIMEOUT_MS = 30000
UI_TIMEOUT_MS = 30000


def load_repo_env() -> None:
    for env_path in ENV_PATHS:
        if env_path.exists():
            load_dotenv(env_path, override=False)


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@dataclass(slots=True)
class LinkedInPosterConfig:
    email: str
    password: str
    company_admin_url: str
    headless: bool
    timeout_ms: int
    retries: int
    storage_state_path: Path
    screenshot_dir: Path

    @classmethod
    def from_env(cls) -> "LinkedInPosterConfig":
        return cls(
            email=require_env("LINKEDIN_EMAIL"),
            password=require_env("LINKEDIN_PASSWORD"),
            company_admin_url=require_env("LINKEDIN_COMPANY_ADMIN_URL"),
            headless=False,
            timeout_ms=int(os.getenv("LINKEDIN_TIMEOUT_MS", str(UI_TIMEOUT_MS))),
            retries=int(os.getenv("LINKEDIN_POST_RETRIES", "0")),
            storage_state_path=Path(
                os.getenv("LINKEDIN_STORAGE_STATE_PATH", str(DEFAULT_STORAGE_STATE_PATH))
            ),
            screenshot_dir=Path(
                os.getenv("LINKEDIN_SCREENSHOT_DIR", str(DEFAULT_SCREENSHOT_DIR))
            ),
        )


class LinkedInPoster:
    def __init__(self, config: LinkedInPosterConfig):
        self.config = config
        self.config.screenshot_dir.mkdir(parents=True, exist_ok=True)
        self.config.storage_state_path.parent.mkdir(parents=True, exist_ok=True)
        self.log = logging.getLogger("linkedin_poster")

    def post_to_linkedin(
        self,
        content: str,
        hashtags: Iterable[str] | None = None,
        company_admin_url: str | None = None,
    ) -> None:
        post_body = self._build_post_body(content, hashtags)
        target_url = (company_admin_url or self.config.company_admin_url).strip()
        last_error: Exception | None = None

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=False)
            try:
                total_attempts = 1
                for attempt in range(1, total_attempts + 1):
                    context: BrowserContext | None = None
                    page: Page | None = None
                    try:
                        self.log.info("LinkedIn post attempt %s started", attempt)
                        context = self._create_context(browser)
                        page = self._get_or_create_single_page(context)
                        page.set_default_timeout(self.config.timeout_ms)
                        page.set_default_navigation_timeout(GOTO_TIMEOUT_MS)
                        self._ensure_logged_in(page)
                        self._go_to_company_admin(page, target_url)
                        self._open_company_post_composer(page)
                        self._fill_post_content(page, post_body)
                        self._submit_post(page)
                        context.storage_state(path=str(self.config.storage_state_path))
                        self.log.info("LinkedIn post published successfully")
                        return
                    except Exception as exc:  # noqa: BLE001
                        last_error = exc
                        self.log.exception("LinkedIn post attempt %s failed", attempt)
                        self._safe_screenshot(page, attempt)
                        break
                    finally:
                        self._safe_close_context(context)
            finally:
                self._safe_close_browser(browser)

        raise RuntimeError(
            f"LinkedIn posting failed after {total_attempts} attempt: {last_error}"
        ) from last_error

    def bootstrap_login(self) -> None:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=False)
            context = browser.new_context()
            page = self._get_or_create_single_page(context)
            page.set_default_timeout(self.config.timeout_ms)
            page.set_default_navigation_timeout(GOTO_TIMEOUT_MS)

            self._login(page)
            self._wait_for_authenticated_home(page)
            context.storage_state(path=str(self.config.storage_state_path))
            self.log.info("Saved LinkedIn session to %s", self.config.storage_state_path)

            context.close()
            browser.close()

    def save_current_session(self) -> None:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=False)
            context = browser.new_context()
            page = self._get_or_create_single_page(context)
            page.set_default_timeout(self.config.timeout_ms)
            page.set_default_navigation_timeout(GOTO_TIMEOUT_MS)

            self.log.info("Open LinkedIn, complete login if needed, then wait for the feed.")
            self._goto_with_retry(page, "https://www.linkedin.com/feed/")
            self._wait_for_authenticated_home(page)
            context.storage_state(path=str(self.config.storage_state_path))
            self.log.info("Saved LinkedIn session to %s", self.config.storage_state_path)

            context.close()
            browser.close()

    def _create_context(self, browser) -> BrowserContext:
        if self.config.storage_state_path.exists():
            self.log.info(
                "Using saved LinkedIn session from %s", self.config.storage_state_path
            )
            return browser.new_context(storage_state=str(self.config.storage_state_path))
        return browser.new_context()

    def _get_or_create_single_page(self, context: BrowserContext) -> Page:
        while len(context.pages) > 1:
            context.pages[-1].close()

        if context.pages:
            return context.pages[0]
        return context.new_page()

    def _ensure_logged_in(self, page: Page) -> None:
        self._goto_with_retry(page, "https://www.linkedin.com/feed/")
        if self._looks_authenticated(page):
            return

        if self.config.storage_state_path.exists():
            raise RuntimeError("Session expired. Run --save-session again")

        self._login(page)
        self._wait_for_authenticated_home(page)

    def _login(self, page: Page) -> None:
        self.log.info("Logging into LinkedIn")
        self._goto_with_retry(page, "https://www.linkedin.com/login")

        username = self._first_visible(
            (
                page.locator("#username"),
                page.get_by_label(re.compile(r"email|phone", re.I)),
            ),
            "LinkedIn username input",
        )
        password = self._first_visible(
            (
                page.locator("#password"),
                page.get_by_label(re.compile(r"password", re.I)),
            ),
            "LinkedIn password input",
        )

        username.fill(self.config.email)
        password.fill(self.config.password)

        sign_in_button = self._first_visible(
            (
                page.get_by_role("button", name=re.compile(r"sign in", re.I)),
                page.locator("button[type='submit']"),
            ),
            "LinkedIn sign-in button",
        )
        sign_in_button.click()

    def _wait_for_authenticated_home(self, page: Page) -> None:
        try:
            page.wait_for_url(
                re.compile(r"linkedin\.com/(feed|checkpoint|company|in)/"),
                timeout=GOTO_TIMEOUT_MS,
            )
        except PlaywrightTimeoutError as exc:
            if self._is_login_page(page):
                raise RuntimeError("Session expired. Run --save-session again") from exc
            if self._page_has_text(page, r"verify|checkpoint|security challenge|two-step"):
                raise RuntimeError(
                    "LinkedIn requested additional verification. Complete it manually once, then rerun --save-session."
                ) from exc
            raise RuntimeError("LinkedIn login did not complete successfully") from exc

    def _looks_authenticated(self, page: Page) -> bool:
        if self._is_login_page(page):
            return False
        if re.search(r"linkedin\.com/(feed|company|in)/", page.url):
            return True
        return self._page_has_text(page, r"home|my network|messaging")

    def _is_login_page(self, page: Page) -> bool:
        return "linkedin.com/login" in page.url or self._page_has_text(page, r"join linkedin|sign in")

    def _go_to_company_admin(self, page: Page, company_admin_url: str) -> None:
        self.log.info("Navigating to %s", company_admin_url)
        page.goto(company_admin_url, wait_until="domcontentloaded", timeout=GOTO_TIMEOUT_MS)

        if self._is_login_page(page):
            raise RuntimeError("Session expired. Run --save-session again")

        if self._page_has_text(page, r"you don'?t have access|page not found|join linkedin"):
            raise RuntimeError(
                "The current LinkedIn account does not have access to the company admin page."
            )

        page.wait_for_selector("body", timeout=GOTO_TIMEOUT_MS)
        dashboard_ready = self._find_visible_locator(
            (
                page.locator("button:has-text('Create')"),
                page.locator("button.org-organizational-page-admin-navigation__cta"),
                page.locator("a:has-text('Start a post')"),
                page.locator("button:has-text('+ Start a post')"),
                page.get_by_text(re.compile(r"today'?s actions|dashboard|page posts|analytics|feed|activity|inbox", re.I)),
            ),
            "LinkedIn company admin dashboard",
            timeout_ms=5000,
            raise_on_missing=False,
        )
        if dashboard_ready is None and "/company/" not in page.url:
            raise RuntimeError("Could not find LinkedIn company admin dashboard.")
        self._dismiss_blocking_overlays(page)
        self.log.info("dashboard loaded")

    def _open_company_post_composer(self, page: Page) -> None:
        self.log.info("Opening LinkedIn post composer")

        share_url = self._company_share_url(page.url)
        self._goto_with_retry(page, share_url)
        self.log.info("clicked create")
        composer_ready = self._best_editor(page, timeout_ms=6000, raise_on_missing=False)
        if composer_ready is not None:
            self.log.info("found create-post action")
            self._wait_for_post_editor(page)
            return

        direct_start = self._find_visible_locator(
            (
                page.locator("a[href*='share=true']:has-text('Start a post')"),
                page.locator("a:has-text('Start a post')"),
                page.get_by_role("link", name=re.compile(r"^\+?\s*start a post$", re.I)),
                page.get_by_role("button", name=re.compile(r"^\+?\s*start a post$", re.I)),
                page.locator("button:has-text('+ Start a post')"),
                page.locator("button:has-text('Start a post')"),
                page.locator("[role='button']:has-text('+ Start a post')"),
                page.locator("[role='button']:has-text('Start a post')"),
                page.get_by_role("button", name=re.compile(r"^create( a)? post$", re.I)),
                page.get_by_role("link", name=re.compile(r"^create( a)? post$", re.I)),
                page.get_by_role("button", name=re.compile(r"^post$", re.I)),
                page.get_by_text(re.compile(r"^\+?\s*start a post$", re.I)),
            ),
            "LinkedIn direct Start a post button",
            timeout_ms=4000,
            raise_on_missing=False,
        )
        if direct_start is not None:
            direct_start.scroll_into_view_if_needed()
            self._activate_post_entry(page, direct_start)
            self.log.info("clicked create post")
            self._wait_for_post_editor(page)
            return

        raise RuntimeError("Could not open LinkedIn post composer.")

    def _open_create_surface(self, page: Page) -> Locator | None:
        exact_create_button = self._find_visible_locator(
            (
                page.locator("button:has-text('Create')"),
            ),
            "LinkedIn Create button",
            timeout_ms=3000,
            raise_on_missing=False,
        )

        if exact_create_button is not None:
            exact_create_button.scroll_into_view_if_needed()
            self._click_locator(exact_create_button)
            self.log.info("clicked create")
            create_container = self._wait_for_create_container(page)
            if create_container is not None:
                return create_container

        create_button = self._find_visible_locator(
            (
                page.locator("button.org-organizational-page-admin-navigation__cta"),
                page.locator("button[role='link']:has-text('Create')"),
                page.locator("button:has-text('+ Create')"),
                page.locator("button:has-text('Create')"),
                page.locator("[role='button']:has-text('+ Create')"),
                page.locator("[role='button']:has-text('Create')"),
            ),
            "LinkedIn Create button",
            timeout_ms=3000,
            raise_on_missing=False,
        )

        if create_button is not None:
            create_button.scroll_into_view_if_needed()
            self._click_locator(create_button)
            self.log.info("clicked create")
            create_container = self._wait_for_create_container(page)
            if create_container is not None:
                return create_container

        create_url = self._company_create_url(page.url)
        self._goto_with_retry(page, create_url)
        self.log.info("clicked create")
        create_container = self._wait_for_create_container(page)
        if create_container is not None:
            return create_container

        raise RuntimeError("Could not open LinkedIn create-post flow.")

    def _wait_for_create_container(self, page: Page) -> Locator | None:
        candidates = (
            page.locator("[role='dialog']"),
            page.locator("[role='menu']"),
            page.locator("[role='listbox']"),
            page.locator("[role='presentation']"),
            page.locator("a[href*='share=true']:has-text('Start a post')"),
            page.locator("div").filter(has_text=re.compile(r"start a post|create( a)? post|share post|post", re.I)),
        )
        container = self._find_visible_locator(
            candidates,
            "LinkedIn create menu",
            timeout_ms=2000,
            raise_on_missing=False,
        )
        return container

    def _find_post_action(self, page: Page, root: Locator | None) -> Locator:
        scopes: list[Page | Locator] = [page]
        if root is not None:
            scopes.insert(0, root)

        for scope in scopes:
            action = self._find_visible_locator(
                self._visible_candidates(
                    scope,
                    (
                        r"^start a post$",
                        r"^create( a)? post$",
                        r"^share post$",
                        r"^post$",
                    ),
                ),
                "LinkedIn create-post action",
                timeout_ms=2000,
                raise_on_missing=False,
            )
            if action is not None:
                return action

        raise RuntimeError("Could not find LinkedIn create-post action.")

    def _wait_for_post_editor(self, page: Page) -> None:
        editor = self._best_editor(page, timeout_ms=15000, raise_on_missing=False)
        post_button = self._best_post_button(page, timeout_ms=5000, raise_on_missing=False)
        if editor is None and post_button is None:
            raise RuntimeError("Could not find LinkedIn post composer.")
        self.log.info("composer visible")

    def _fill_post_content(self, page: Page, content: str) -> None:
        self.log.info("Filling LinkedIn post content")
        editor = self._best_editor(page)

        editor.click(force=True)
        cleared = False
        try:
            current_text = ""
            try:
                current_text = (editor.inner_text(timeout=1000) or "").strip()
            except PlaywrightError:
                current_text = ""

            if current_text:
                page.keyboard.press("Control+A")
                page.keyboard.press("Backspace")
                cleared = True

            editor.fill(content)
        except PlaywrightError:
            try:
                if not cleared:
                    page.keyboard.press("Control+A")
                    page.keyboard.press("Backspace")
            except PlaywrightError:
                pass
            try:
                page.keyboard.insert_text(content)
            except PlaywrightError:
                editor.evaluate(
                    """(node, value) => {
                        node.focus();
                        if ('value' in node) {
                            node.value = value;
                            node.dispatchEvent(new Event('input', { bubbles: true }));
                            return;
                        }
                        node.textContent = value;
                        node.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
                    }""",
                    content,
                )

        final_text = ""
        try:
            final_text = (editor.inner_text(timeout=2000) or "").strip()
        except PlaywrightError:
            try:
                final_text = (editor.text_content(timeout=2000) or "").strip()
            except PlaywrightError:
                try:
                    final_text = (editor.evaluate("node => (node.innerText || node.textContent || node.value || '').trim()") or "").strip()
                except PlaywrightError:
                    final_text = ""

        if not final_text:
            raise RuntimeError("LinkedIn post editor stayed empty after filling content.")

        page.keyboard.press("End")
        self.log.info("content filled")

    def _submit_post(self, page: Page) -> None:
        self.log.info("Submitting LinkedIn post")
        self._ensure_anyone_visibility(page)
        dialog = self._composer_dialog(page)
        post_button = self._best_post_button(page)

        self._click_locator(post_button)
        self.log.info("post submitted")

        if self._wait_for_post_success(page, dialog):
            self.log.info("success confirmed")
            return
        raise RuntimeError("LinkedIn composer did not close after clicking Post.")

    def _capture_failure_screenshot(self, page: Page, attempt: int) -> None:
        screenshot = self.config.screenshot_dir / f"linkedin_post_failure_attempt_{attempt}.png"
        try:
            if page.is_closed():
                return
            page.screenshot(path=str(screenshot), full_page=True)
            self.log.info("Saved failure screenshot to %s", screenshot)
        except PlaywrightError:
            self.log.warning("Failed to save LinkedIn failure screenshot")

    def _goto_with_retry(self, page: Page, url: str) -> None:
        last_error: Exception | None = None

        for attempt in range(3):
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=GOTO_TIMEOUT_MS)
                page.wait_for_selector("body", timeout=GOTO_TIMEOUT_MS)
                return
            except PlaywrightTimeoutError as exc:
                last_error = exc
                if self._is_login_page(page):
                    raise RuntimeError("Session expired. Run --save-session again") from exc
                if self._page_ready_after_timeout(page):
                    return
                if attempt == 2:
                    raise
                try:
                    page.reload(wait_until="domcontentloaded", timeout=GOTO_TIMEOUT_MS)
                except PlaywrightError:
                    pass
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt == 2:
                    raise
                try:
                    page.reload(wait_until="domcontentloaded", timeout=GOTO_TIMEOUT_MS)
                except PlaywrightError:
                    pass

        if last_error is not None:
            raise last_error

    def _ensure_anyone_visibility(self, page: Page) -> None:
        dialog = self._composer_dialog(page)
        current_anyone = self._find_visible_locator(
            (
                dialog.get_by_text(re.compile(r"post to anyone", re.I)),
                dialog.get_by_role("button", name=re.compile(r"post to anyone|anyone", re.I)),
                dialog.locator("button").filter(has_text=re.compile(r"post to anyone|anyone", re.I)),
            ),
            "LinkedIn Anyone visibility indicator",
            timeout_ms=2000,
            raise_on_missing=False,
        )
        if current_anyone is not None:
            return

        visibility_trigger = self._find_visible_locator(
            (
                dialog.get_by_role("button", name=re.compile(r"post to|anyone|connections only|employees", re.I)),
                dialog.locator("button").filter(has_text=re.compile(r"post to|anyone|connections only|employees", re.I)),
                dialog.locator("[role='button']").filter(has_text=re.compile(r"post to|anyone|connections only|employees", re.I)),
            ),
            "LinkedIn visibility selector",
            timeout_ms=3000,
            raise_on_missing=False,
        )

        if visibility_trigger is None:
            return

        self._click_locator(visibility_trigger)
        option_scope = self._find_visible_locator(
            (
                page.locator("[role='dialog']").filter(has_text=re.compile(r"anyone|connections only|employees", re.I)),
                page.locator("[role='listbox']").filter(has_text=re.compile(r"anyone|connections only|employees", re.I)),
                page.locator("[role='menu']").filter(has_text=re.compile(r"anyone|connections only|employees", re.I)),
                page.locator("div").filter(has_text=re.compile(r"anyone|connections only|employees", re.I)),
            ),
            "LinkedIn visibility options",
            timeout_ms=5000,
            raise_on_missing=False,
        )
        if option_scope is None:
            return

        anyone_option = self._find_visible_locator(
            self._visible_candidates(
                option_scope,
                (
                    r"^anyone$",
                    r"post to anyone",
                ),
            ),
            "LinkedIn Anyone option",
            timeout_ms=4000,
            raise_on_missing=False,
        )
        if anyone_option is not None:
            self._click_locator(anyone_option)

        confirm_button = self._find_visible_locator(
            (
                page.get_by_role("button", name=re.compile(r"done|save|apply", re.I)),
                page.locator("button").filter(has_text=re.compile(r"done|save|apply", re.I)),
            ),
            "LinkedIn visibility confirmation button",
            timeout_ms=3000,
            raise_on_missing=False,
        )
        if confirm_button is not None and not confirm_button.is_disabled():
            self._click_locator(confirm_button)

    @staticmethod
    def _build_post_body(content: str, hashtags: Iterable[str] | None) -> str:
        content = content.strip()
        if not hashtags:
            return content

        normalized_tags: list[str] = []
        for tag in hashtags:
            clean_tag = tag.strip()
            if not clean_tag:
                continue
            normalized_tags.append(clean_tag if clean_tag.startswith("#") else f"#{clean_tag}")

        if not normalized_tags:
            return content
        return f"{content}\n\n{' '.join(normalized_tags)}"

    @staticmethod
    def _company_create_url(current_url: str) -> str:
        base_url = current_url.split("?", 1)[0].rstrip("/")
        return f"{base_url}/?createPageAssets=true"

    @staticmethod
    def _company_share_url(current_url: str) -> str:
        match = re.search(r"/company/(\d+)/", current_url)
        if not match:
            raise RuntimeError("Could not determine LinkedIn company id for share flow.")
        company_id = match.group(1)
        return f"https://www.linkedin.com/company/{company_id}/admin/page-posts/published/?share=true"

    @staticmethod
    def _composer_dialog(page: Page) -> Locator:
        return page.locator("[role='dialog']").last

    def _dismiss_blocking_overlays(self, page: Page) -> None:
        dismissors = (
            page.get_by_role("button", name=re.compile(r"close|dismiss|got it|not relevant", re.I)),
            page.locator("button[aria-label*='dismiss' i]"),
            page.locator("button[aria-label*='close' i]"),
        )

        for locator in dismissors:
            candidate = locator.first
            if self._is_visible(candidate):
                try:
                    candidate.click()
                except PlaywrightError:
                    continue

    @staticmethod
    def _page_has_text(page: Page, pattern: str) -> bool:
        try:
            page.get_by_text(re.compile(pattern, re.I)).first.wait_for(
                state="visible",
                timeout=1000,
            )
            return True
        except (PlaywrightTimeoutError, PlaywrightError):
            return False

    def _page_ready_after_timeout(self, page: Page) -> bool:
        return self._find_visible_locator(
            (
                page.locator("button:has-text('+ Start a post')"),
                page.locator("button:has-text('+ Create')"),
                page.locator("button:has-text('Create')"),
                page.locator("[role='button']:has-text('+ Create')"),
                page.locator("[role='button']:has-text('Create')"),
                page.get_by_text(re.compile(r"today'?s actions|dashboard|page posts|analytics", re.I)),
                page.locator("[contenteditable='true']"),
                page.locator("div[role='textbox']"),
            ),
            "LinkedIn page readiness markers",
            timeout_ms=2000,
            raise_on_missing=False,
        ) is not None

    def _wait_for_post_success(self, page: Page, dialog: Locator) -> bool:
        checks = (
            lambda: dialog.wait_for(state="hidden", timeout=20000) or True,
            lambda: self._find_visible_locator(
                (
                    page.get_by_text(re.compile(r"posted|shared|now live|post published", re.I)),
                    page.locator("[role='alert']").filter(has_text=re.compile(r"posted|shared|live", re.I)),
                ),
                "LinkedIn success message",
                timeout_ms=5000,
                raise_on_missing=False,
            )
            is not None,
            lambda: self._page_ready_after_timeout(page)
            and self._best_editor(page, timeout_ms=1000, raise_on_missing=False) is None,
        )

        for check in checks:
            try:
                if check():
                    return True
            except (PlaywrightTimeoutError, PlaywrightError):
                continue
        return False

    @staticmethod
    def _find_visible_locator(
        locators: Iterable[Locator],
        label: str,
        timeout_ms: int = UI_TIMEOUT_MS,
        raise_on_missing: bool = True,
    ) -> Locator | None:
        for locator in locators:
            candidate = locator.first
            try:
                candidate.wait_for(state="visible", timeout=timeout_ms)
                return candidate
            except (PlaywrightTimeoutError, PlaywrightError):
                continue
        if raise_on_missing:
            raise RuntimeError(f"Could not find {label}.")
        return None

    def _visible_candidates(
        self,
        scope: Page | Locator,
        patterns: Iterable[str],
    ) -> list[Locator]:
        locators: list[Locator] = []
        for pattern in patterns:
            regex = re.compile(pattern, re.I)
            locators.extend(
                [
                    scope.locator("a[href*='share=true']").filter(has_text=regex),
                    scope.get_by_role("button", name=regex),
                    scope.get_by_role("link", name=regex),
                    scope.get_by_role("menuitem", name=regex),
                    scope.get_by_text(regex),
                    scope.locator("button").filter(has_text=regex),
                    scope.locator("[role='button']").filter(has_text=regex),
                    scope.locator("a").filter(has_text=regex),
                    scope.locator("div").filter(has_text=regex),
                    scope.locator("span").filter(has_text=regex),
                ]
            )
        return locators

    def _activate_post_entry(self, page: Page, locator: Locator) -> None:
        href = None
        try:
            href = locator.get_attribute("href")
        except PlaywrightError:
            href = None

        if not href:
            try:
                href = locator.evaluate(
                    """(node) => {
                        const clickable = node.closest('a,button,[role="button"],[role="link"],[role="menuitem"]');
                        return clickable ? clickable.getAttribute('href') : null;
                    }"""
                )
            except PlaywrightError:
                href = None

        if href:
            href = urljoin(page.url, href.strip())

        if href and ("share=true" in href or "/admin/feed/posts" in href or "/admin/page-posts/published" in href):
            self._goto_with_retry(page, href)
            return

        self._click_locator(locator)

    def _best_editor(
        self,
        page: Page,
        timeout_ms: int = UI_TIMEOUT_MS,
        raise_on_missing: bool = True,
    ) -> Locator | None:
        dialog = self._composer_dialog(page)
        dialog_locators = (
            dialog.locator("[contenteditable='true']"),
            dialog.get_by_role("textbox"),
            dialog.locator(".ql-editor"),
            dialog.locator("[data-placeholder*='What do you want to talk about']"),
            dialog.locator("[data-placeholder*='Write something']"),
        )
        global_locators = (
            page.locator("[contenteditable='true']"),
            page.locator("[role='textbox']"),
            page.locator(".ql-editor"),
            page.locator("[data-placeholder*='What do you want to talk about']"),
            page.locator("[data-placeholder*='Write something']"),
        )
        return self._find_visible_locator(
            (*dialog_locators, *global_locators),
            "LinkedIn post editor",
            timeout_ms=timeout_ms,
            raise_on_missing=raise_on_missing,
        )

    def _best_post_button(
        self,
        page: Page,
        timeout_ms: int = UI_TIMEOUT_MS,
        raise_on_missing: bool = True,
    ) -> Locator | None:
        dialog = self._composer_dialog(page)
        candidates = [
            dialog.get_by_role("button", name=re.compile(r"^post$", re.I)),
            dialog.locator("button").filter(has_text=re.compile(r"^\s*post\s*$", re.I)),
            dialog.locator("[role='button']").filter(has_text=re.compile(r"^\s*post\s*$", re.I)),
            dialog.locator("button:has(span:has-text('Post'))"),
            dialog.locator("button").filter(has=page.locator("span", has_text=re.compile(r"^\s*post\s*$", re.I))),
            page.get_by_role("button", name=re.compile(r"^post$", re.I)),
            page.locator("button:has-text('Post')"),
            page.locator("[role='button']:has-text('Post')"),
        ]
        for locator in candidates:
            candidate = self._find_visible_locator(
                (locator,),
                "LinkedIn Post button",
                timeout_ms=timeout_ms,
                raise_on_missing=False,
            )
            if candidate is None:
                continue
            try:
                label = (candidate.inner_text(timeout=500) or "").strip().lower()
                if not candidate.is_disabled() and label == "post":
                    return candidate
            except PlaywrightError:
                continue
        if raise_on_missing:
            raise RuntimeError("Could not find LinkedIn Post button.")
        return None

    @staticmethod
    def _first_visible(
        locators: Iterable[Locator],
        label: str,
        timeout_ms: int = UI_TIMEOUT_MS,
    ) -> Locator:
        locator = LinkedInPoster._find_visible_locator(
            locators,
            label,
            timeout_ms=timeout_ms,
            raise_on_missing=True,
        )
        assert locator is not None
        return locator

    @staticmethod
    def _click_locator(locator: Locator) -> None:
        try:
            locator.click(force=True)
        except PlaywrightError:
            try:
                box = locator.bounding_box()
                if box:
                    page = locator.page
                    page.mouse.click(
                        box["x"] + (box["width"] / 2),
                        box["y"] + (box["height"] / 2),
                    )
                    return
            except PlaywrightError:
                pass
            locator.evaluate("(node) => node.click()")

    @staticmethod
    def _is_visible(locator: Locator) -> bool:
        try:
            return locator.is_visible()
        except PlaywrightError:
            return False

    def _safe_screenshot(self, page: Page | None, attempt: int) -> None:
        if page is None:
            return
        try:
            self._capture_failure_screenshot(page, attempt)
        except PlaywrightError:
            self.log.warning("Failed to save LinkedIn failure screenshot")

    @staticmethod
    def _safe_close_context(context: BrowserContext | None) -> None:
        if context is None:
            return
        try:
            context.close()
        except PlaywrightError:
            return

    @staticmethod
    def _safe_close_browser(browser) -> None:
        if browser is None:
            return
        try:
            browser.close()
        except PlaywrightError:
            return


def post_to_linkedin(
    content: str,
    hashtags: Iterable[str] | None = None,
    company_admin_url: str | None = None,
) -> None:
    load_repo_env()
    config = LinkedInPosterConfig.from_env()
    poster = LinkedInPoster(config)
    poster.post_to_linkedin(content=content, hashtags=hashtags, company_admin_url=company_admin_url)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Post content to LinkedIn company page via Playwright.")
    parser.add_argument(
        "content",
        nargs="?",
        help="Post content. Falls back to LINKEDIN_POST_CONTENT if omitted.",
    )
    parser.add_argument(
        "--hashtags",
        default=os.getenv("LINKEDIN_POST_HASHTAGS", ""),
        help="Comma-separated hashtags without or with #.",
    )
    parser.add_argument(
        "--company-url",
        default=os.getenv("LINKEDIN_COMPANY_ADMIN_URL", DEFAULT_COMPANY_ADMIN_URL),
        help="LinkedIn company admin dashboard URL.",
    )
    parser.add_argument(
        "--bootstrap-login",
        action="store_true",
        help="Open LinkedIn login once and save persistent browser session.",
    )
    parser.add_argument(
        "--save-session",
        action="store_true",
        help="Open a visible browser and save the current LinkedIn session without requiring credentials.",
    )
    return parser


def _setup_logging() -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        stream=sys.stdout,
    )


def main() -> int:
    load_repo_env()
    _setup_logging()

    parser = _build_arg_parser()
    args = parser.parse_args()

    config = LinkedInPosterConfig.from_env()
    poster = LinkedInPoster(config)

    if args.bootstrap_login:
        poster.bootstrap_login()
        return 0

    if args.save_session:
        poster.save_current_session()
        return 0

    content = (args.content or os.getenv("LINKEDIN_POST_CONTENT", "")).strip()
    if not content:
        parser.error("Provide post content as an argument or via LINKEDIN_POST_CONTENT.")

    hashtags = [item.strip() for item in args.hashtags.split(",") if item.strip()]
    poster.post_to_linkedin(
        content=content,
        hashtags=hashtags,
        company_admin_url=args.company_url,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
