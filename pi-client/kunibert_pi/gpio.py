"""Hardware-neutraler GPIO-Zustandsautomat für den Ritter-Kunibert-Prototyp."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Callable, Protocol


class DeviceState(str, Enum):
    READY = "bereit"
    RECORDING = "aufnahme"
    PROCESSING = "verarbeitung"
    PLAYING = "wiedergabe"
    MUTED = "mikrofon-aus"
    ERROR = "fehler"


class ButtonLike(Protocol):
    def when_pressed(self, callback: Callable[[], None]) -> None: ...
    def close(self) -> None: ...


class LEDLike(Protocol):
    def on(self) -> None: ...
    def off(self) -> None: ...
    def blink(self, on_time: float = 0.5, off_time: float = 0.5) -> None: ...
    def close(self) -> None: ...


class InputLike(Protocol):
    @property
    def is_active(self) -> bool: ...
    def when_activated(self, callback: Callable[[], None]) -> None: ...
    def when_deactivated(self, callback: Callable[[], None]) -> None: ...
    def close(self) -> None: ...


class StateLights:
    """Mapping eines einzelnen Statuslichts auf sichere, verständliche Zustände."""

    def __init__(self, led: LEDLike):
        self.led = led
        self.current = DeviceState.READY

    def set(self, state: DeviceState) -> None:
        self.current = state
        if state == DeviceState.RECORDING:
            self.led.blink(on_time=0.15, off_time=0.15)
        elif state == DeviceState.PROCESSING:
            self.led.blink(on_time=0.7, off_time=0.7)
        elif state == DeviceState.PLAYING:
            self.led.on()
        elif state == DeviceState.ERROR:
            self.led.blink(on_time=0.08, off_time=0.08)
        elif state == DeviceState.MUTED:
            self.led.off()
        else:
            self.led.off()

    def close(self) -> None:
        self.led.off()
        self.led.close()


@dataclass(frozen=True)
class Pins:
    speak_button: int = 5
    story_button: int = 6
    status_led: int = 17
    microphone_mute: int = 22


class KunibertGPIO:
    """Callbacks und Zustände; Hardwareobjekte werden injiziert, damit Tests ohne Pi laufen."""

    def __init__(self, speak_button: ButtonLike, story_button: ButtonLike,
                 mute_input: InputLike, lights: StateLights,
                 on_speak: Callable[[], None], on_story: Callable[[], None]):
        self.speak_button = speak_button
        self.story_button = story_button
        self.mute_input = mute_input
        self.lights = lights
        self.on_speak = on_speak
        self.on_story = on_story
        self.state = DeviceState.MUTED if mute_input.is_active else DeviceState.READY
        self.lights.set(self.state)
        speak_button.when_pressed(self._speak_pressed)
        story_button.when_pressed(self._story_pressed)
        mute_input.when_activated(self._mute_changed)
        mute_input.when_deactivated(self._mute_cleared)

    def _speak_pressed(self) -> None:
        if self.mute_input.is_active or self.state != DeviceState.READY:
            return
        self.on_speak()

    def _story_pressed(self) -> None:
        if self.mute_input.is_active or self.state != DeviceState.READY:
            return
        self.on_story()

    def _mute_changed(self) -> None:
        self.set_state(DeviceState.MUTED)

    def _mute_cleared(self) -> None:
        if self.state == DeviceState.MUTED:
            self.set_state(DeviceState.READY)

    def set_state(self, state: DeviceState) -> None:
        if self.mute_input.is_active and state not in {DeviceState.MUTED, DeviceState.READY}:
            state = DeviceState.MUTED
        self.state = state
        self.lights.set(state)

    def close(self) -> None:
        for component in (self.speak_button, self.story_button, self.mute_input):
            component.close()
        self.lights.close()


def build_real_gpio(pins: Pins, on_speak: Callable[[], None], on_story: Callable[[], None]) -> KunibertGPIO:
    """Create the real gpiozero wiring. Imports gpiozero only on Raspberry Pi."""
    try:
        from gpiozero import Button, DigitalInputDevice, LED
    except ImportError as exc:
        raise RuntimeError("gpiozero fehlt; auf Raspberry Pi OS installieren") from exc

    # Buttons use the internal pull-up: button connects GPIO to GND when pressed.
    speak = Button(pins.speak_button, pull_up=True, bounce_time=0.08)
    story = Button(pins.story_button, pull_up=True, bounce_time=0.08)
    # This input is active when the physical mute switch connects the pin to GND.
    mute = DigitalInputDevice(pins.microphone_mute, pull_up=True, bounce_time=0.05)

    class Adapter:
        def __init__(self, obj):
            self.obj = obj
        def when_pressed(self, callback):
            self.obj.when_pressed = callback
        def when_activated(self, callback):
            self.obj.when_activated = callback
        def when_deactivated(self, callback):
            self.obj.when_deactivated = callback
        @property
        def is_active(self):
            return self.obj.is_active
        def close(self):
            self.obj.close()

    return KunibertGPIO(Adapter(speak), Adapter(story), Adapter(mute),
                        StateLights(LED(pins.status_led)), on_speak, on_story)
