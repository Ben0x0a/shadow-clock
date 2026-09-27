# Date a photo series with a wrong camera clock

Camera clocks are often wrong by hours or years, but the **differences** between photos of
one series are reliable to a second or two.

1. Time mode; enter the place.
2. Shadow 1: the first photo.
3. Add a shadow → **Another photo**, and enter "Taken after shadow 1" as the EXIF difference
   (e.g. `+01:23:04`) with a small uncertainty (`2 s`).
4. Photos hours apart constrain the Sun's motion: they fix the side of solar noon even
   without azimuth, and narrow the daily windows.
5. The true time is shot 1's solution; the camera's clock error is the claimed time minus it.
