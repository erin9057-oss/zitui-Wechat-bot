![banner](https://github.com/user-attachments/assets/f199318c-2d14-4ed6-9ef8-646e17f3040d)

# Zitui Wechat Bot

[简体中文](./README.zh_CN.md) | English

This plugin exists for one reason.

So we can talk to our oshi directly inside WeChat.

Not switching to another app.  
Not moving the conversation somewhere else.

Just WeChat.

---

## What this repo is

This repo is the core plugin.

It connects to WeChat,  
takes whatever you send — text, images, voice, links —  
and passes it to your model.

If you set up image generation, voice, sensors, memory,  
he will use them.

You don’t have to configure everything at once.  
Get him talking first. Then add things slowly.

---

## What he can do

### Chat inside WeChat

You can talk to him directly in WeChat.

If you send multiple messages in a short time,  
they won’t interrupt each other immediately.

The plugin waits a bit,  
then merges them and sends everything together.

While waiting for the model,  
you’ll see the “typing” status.

---

### Receive images, voice and links

Images, voice messages and other media you send  
will be downloaded and passed to the model.

---

### Image generation

If image generation is configured,

he can trigger it through `<pic>` tags in his reply,  
and send the generated image back to WeChat.

If there is a `ref.jpg` in the root folder,  
it will be used as a reference image.

---

### Voice

This is not real WeChat voice messages yet.

He sends an mp4  
that looks like a voice bubble.

(I haven’t fully figured out the WeChat voice protocol yet)

---

### Phone activity awareness

If you connect MacroDroid, Shortcuts,  
or anything that can send HTTP requests,

your phone activity can be sent to the plugin.

For example, when you open certain apps,  
it gets recorded as part of your day.

So when he replies,  
he’s not just looking at chat history.

He also knows a bit about what you’ve been doing.

---

### He can start conversations

He doesn’t just wait for you.

You can configure idle time, wake windows,  
and sensor-triggered behaviors.

When conditions are met,  
he can come talk to you first.

---

### Memory

This plugin is not trying to dump chat logs into a database.

What I want  
is for him to remember you in a more human way.

So the vector system is not just  
embedding similarity + top-k recall.

Conversations are first structured into scenes.

Each scene has:

- a title  
- anchors  
- emotional shifts

Then they go into the vector store.

Daily diaries are also stored separately.

---

When he recalls something,  
he doesn’t only look at text similarity.

He also considers:

- emotional state  
- whether it has been revisited  
- how long since last recall

---

I want every reply to feel like a memory,  
not a lookup.

---

Typical LLM reranking didn’t really fit this,  
so I implemented a local six-dimensional emotional reranker.

To keep him respectful, restrained,  
and grounded in care.

Respect is the baseline of love.

---

### Workspace

His personality and behavior  
live in `workspace/`.

Main files:

```text
AGENTS.md
IDENTITY.md
USER.md
MEMORY.md
SOUL.md
```

---

## Configuration

Everything can be configured directly:

- `config.json`
- `workspace/`
- or the code itself

---

If you don’t want to edit files all the time,  
you can also use the SillyTavern bridge plugin:

https://github.com/erin9057-oss/zitui-st-wechat-bridge

Feels more like something a human would actually use.

---

## Installation

This repo is the plugin core.

In Termux or any Linux server,  
copy this line and run it:

```bash
bash <(curl -sSL https://raw.githubusercontent.com/erin9057-oss/zitui-Wechat-bot/main/install.sh)
```

---

## Login

After installation, scan the QR code  
with the WeChat account you want him to use.

---

## Update

Do not update with git directly.

```bash
cd ~/WechatAI/openclaw-weixin
bash update.sh
```

---

## That’s it

Get it running first.

Talk to him.

Then adjust things later.
