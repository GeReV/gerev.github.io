---
layout: post
title: How I turned my laptop into a cheap Wacom Cintiq
description: "A look at how I turned my Lenovo Thinkpad X1 Carbon into a cheap 
Cintiq with a Bluetooth pressure-sensitive stylus."
modified: 2014-06-07
tags: [linux]
comments: true
share: true  
---

### TL;DR

This post is a behind-the-scenes look at how I got two devices, a Bluetooth 
stylus and a laptop touchscreen, working together to make my laptop into a paint 
tablet.

The code for this is available in my GitHub repository:

[https://github.com/GeReV/adonit_linux](https://github.com/GeReV/adonit_linux)

### To make a long story short

For quite a few years I've been dreaming about getting myself a [Wacom 
Cintiq](http://www.wacom.com/en/us/creative/cintiq-13-hd).

It's awesome, it has the perfect combination of painting on paper and paiting 
using Photoshop.  Unfortunately, Cintiqs are mostly aimed at the professional 
market - concept artists and the likes, and comes with a hefty price tags - 
hundreds of dollars for the smallest version of the device.

On November 2013, I had the chance of going to the US on a company business 
trip, where I decided to go on an online shopping spree and got me an [Adonit 
Jot Touch 4](http://www.adonit.net/jot/touch).  This is an affordable (89.99$ 
US) Bluetooth, pressure-sensitive stylus intended to work with certain iPad and 
iPhone paint apps.

I thought to myself, "in the worst case, I'll adapt it to the PC, how hard can 
it be?" And indeed the worse case happened.

In this post I'll detail the process of adapting this stylus to the PC and 
getting it to work with my laptop's touchscreen.

### The process

When first trying to get the Jot to connect to my PC, I discovered there's no 
way to get it to appear for pairing. I got frustrated pretty quickly and left it 
on my desk.

After a while I decided to get the help of a colleague who has some mad 
reverse-engineering skills. In some obscure way I have yet to discover, he 
managed to find a certain UUID related to the device - 
`dcd68980-aadc-11e1-a22a-0002a5d5c51b`.

He just Googled the UUID and came up with a ready-made C library with a demo for 
this exact brand of stylus - [*libgato*](https://gitorious.org/gato) by [Javier 
Pedro](http://javispedro.com). It was like getting everything served on a silver 
platter.

We immediately tried to build the sample code, but it didn't work; It discovered 
the device, but it wouldn't connect.

We started tinkering until I found the following bit of code:

~~~c
qDebug() << "Found peripheral" << peripheral->address().toString() << 
peripheral->name();
if (peripheral->name() == "JN104FE9") {
  manager->stopScan();
  // ...
  peripheral->connectPeripheral();
}
~~~

Well, that's not the name my device advertises... I just removed that test, and 
suddenly we could see the updates sent by the stylus! It changed when pressing 
the stylus' tip and everything!

After some more playing, I discovered the stylus reports a bunch of 16-bit 
integers in each update, but only one changed whenever I tapped the stylus' 
buttons and pressed its tip. A bit of guesswork and it turns out the device 
encodes its two buttons as the first 2 bits (bit 0 and bit 1), and the pressure 
as the 11 significant bits. (i.e. `XXXXXXXXXXX000BA`, where `X`'s are for 
pressure, `B` is for button 1 and `A` is for button 0).

A little bit manipulation and I can report the specific events.

This was the jumpstart I needed to get things moving.

### Creating the input device

My colleague introduced my to 
[*uinput*](http://thiemonge.org/getting-started-with-uinput), the Linux 
user-level input subsystem. This basically let me create an input device from my 
code and get a file representing my newly-invented "Cintiq".

~~~c
int fd = open("/dev/uinput", O_RDWR);
~~~

By opening the `/dev/uinput` file for writing, you get an event file under 
`/dev/input`. This file now represents your new device.

After some research, I found 
[*wdaemon*](http://sourceforge.net/apps/mediawiki/linuxwacom/index.php?title=Wdaemon).  
Part of the [*The Linux Wacom 
Project*](http://sourceforge.net/apps/mediawiki/linuxwacom/index.php?title=Main_Page), 
which was adapted as the official driver for Wacom devices. The cool difference 
was that *wdaemon* did everything on the user-level instead of running from the 
kernel. This gave me the basis for the final result.

So now I could connect to the stylus, get it's updates and write them to my 
input device! Perfect!

### The GIMP problem

I immediately launched [GIMP](http://www.gimp.org), and went to the Input 
Devices dialog.

At first, the device did not appear there, and I cannot remember how I made it 
appear, but for all I remember it was something like declaring the device's 
abilities in code (like 
[this](https://github.com/GeReV/adonit_linux/blob/master/uinput.c#L51-L87)).

But then, as it turns out, GIMP can only handle a single input device at a time.  
That meant I can't just take the pressure from the stylus and have it combined 
with the pointer.

God-damnit GIMP. God. Damnit. I gave up again.

A while later I asked a [question on 
StackOverflow.com](http://stackoverflow.com/questions/23149093/create-a-wacom-like-linux-uinput-device-for-work-with-touchscreen-and-pen).
A week and 100 reputation points bounty I got [an 
answer](http://stackoverflow.com/a/23311940/242826).

As it turns out, I just needed to add position information to the events I am 
sending. Fair enough.

### Combining input

At this point I mostly understood how the input subsystem works, all I had to do 
is read `struct input_event`s from a file and reuse them.

~~~c
while(read(touchscreen_fd, &event, sizeof(struct input_event)) > 0) {
  if (event.type == EV_ABS) {
    if (event.code == ABS_X || event.code == ABS_Y) {
      uinput_write_event(uinput_fd, &event);
    }
  }
}
~~~

I found the touchscreen's event file:

~~~
cat /proc/bus/input/devices
~~~

And simply used a loop to read all the input events from the `event**` file 
associated with my touchscreen, filter out the ones who stated location, and 
write them back to my uinput file.  It was that simple.

Not quite. GIMP still didn't work. It kept using the mouse pointer input device 
when I touched the screen.

My guess was that the events I am reading are also interpreted as pointer 
events. I remembered reading somewhere that you could get input from the devices 
*exclusively*, meaning they wouldn't go to other devices after I read them.

Turns out I was right.

~~~c
int grab = 1;
ioctl(uinput_fd, EVIOCGRAB, &grab);
~~~

And suddenly GIMP interpret the touches as mouse movement. Awesome. But still no 
response when trying to paint.

### Last resort

At this point I thought everything should work correctly, but it didn't.

Luckily, a few years ago, I got my younger sister an actual [Wacom 
tablet](http://www.amazon.com/Wacom-Bamboo-Capture-Tablet-CTH470/dp/B005HGBEZ2), 
so I did what I should have done in the beginning. I hooked it up, and looked at 
the `input_event`s passing around.

And there was the missing piece - every time the stylus touches the tablet, an 
EV_KEY event is sent. That event basically said "`EV_KEY` event, `BTN_TOOL_PEN`, 
down". When it was lifted, the same event happened again, with a code that said 
"`EV_KEY`, `BTN_TOOL_PEN`, up".

I checked again, and my touchscreen did the exact same thing, only it said 
`BTN_TOUCH` instead, and I ignored it.

Changed the code so it sends a `BTN_TOOL_PEN` at the same times, and it worked!  

~~~c
if (event->type == EV_KEY) {
  // In the final result, the following if is commented out, as it worked
  // correctly as-is.
  if (event->code == BTN_TOUCH) {
    event->code = BTN_TOOL_PEN;
  }

  uinput_write_event(&uinfo, event);
}
~~~

After nearly six months of playing with this on-and-off, it finally worked!

### Refactoring

My code was working, but not very well, it was stuttering and the pointer jumped 
around inexplicably. The events coming from the touchscreen were only updated 
when the stylus reported changes. This was due to *libgato*'s architecture, and 
was way too slow.

I decided I want to get rid of *libgato* and write it from scratch, as *libgato* 
was using [*Qt*](http://qt-project.org) and was relying heavily on [its 
SLOT/SIGNAL mechanism](http://qt-project.org/doc/qt-4.8/signalsandslots.html), 
which made it harder for me to add the code I wanted, where I wanted.

At first, I spent a while trying to flatten *libgato* and get only the relevant 
code out, but it didn't play out so well.

I tried writing it from scratch, turns out it's quite difficult. Tried Python, 
still harder than I wanted.

I even tried taking [code from 
*BlueZ*](http://git.kernel.org/cgit/bluetooth/bluez.git/tree/attrib/interactive.c), 
which seemed perfect but I had no idea how to extract it out and ended up making 
a mess.

Eventually, I ran into a [GitHub 
repository](https://github.com/IanHarvey/bluepy) by [Ian 
Harvey](https://github.com/IanHarvey), which had exactly what I wanted. He 
extracted the exact piece of code I needed from BlueZ and used it.

After playing around with it, and learning some of the 
[intricacies](https://developer.gnome.org/glib/2.28/glib-IO-Channels.html#g-io-channel-unix-new) 
of [GLib](https://developer.gnome.org/glib/2.28/index.html) and [its event 
loop](https://developer.gnome.org/glib/2.28/glib-The-Main-Event-Loop.html), I 
finally managed to get events from both devices without any stuttering or 
noticeable jumps or delays.

Everything finally worked as I wanted. Time to start painting!

### Future work

At the time of writing this, everything in the code is hard-coded.

The input device files to read from, the Bluetooth attributes to register for 
change notifications. The stylus' MAC address has to be specified.

Later on, I plan on adding code to discover this information automatically, so 
the only step needed is running the binary.

The code behind this article is available in my [GitHub repository](https://github.com/GeReV/adonit_linux). Any and 
all comments and suggestions are welcome.
