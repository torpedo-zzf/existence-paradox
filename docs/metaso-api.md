curl --request POST \
  --url https://metaso.cn/api/minimax/v2/video_generation \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "史诗级太空歌剧院线预告：女舰长独自站在巨大观景窗前，最后一支舰队正在集结并跃迁离去，强光爆闪、舰桥震动，她被留在原地。"
    }
  ],
  "resolution": "2K",
  "duration": 5,
  "ratio": "16:9",
  "fast_mode": false
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/video_generation \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Pull focus to the people in the background and add more steam to the ramen bowl."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/H3_AA_I2VA/gallery/sr_v17_variants_seed42_43_20260724/inputs/4a3a90bf9100_KDmcbkhzYo5sjjxr9FqcVmWVnzb.png"
      },
      "role": "first_frame"
    }
  ],
  "resolution": "2K",
  "duration": 5,
  "ratio": "adaptive",
  "fast_mode": false
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/video_generation \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "角色说话：Follow the wind, live free.Leave worries behind, enjoy the moment，音色参考音频1"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/297573323635_00_%E8%A7%86%E9%A2%911_YnyRbxEwio_video_20260525_163755_1927e9d3.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/f463d523c5ce_01_%E9%9F%B3%E9%A2%911_RSLcbpzJPo_6%E6%9C%885%E6%97%A5(1).mp3"
      },
      "role": "reference_audio"
    }
  ],
  "resolution": "2K",
  "duration": 5,
  "ratio": "adaptive",
  "fast_mode": false
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/video_generation \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "从首帧平滑过渡到尾帧，保持参考图中角色的外观与服装一致。"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://your-cdn.example.com/first-frame.jpg"
      },
      "role": "first_frame"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://your-cdn.example.com/last-frame.jpg"
      },
      "role": "last_frame"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://your-cdn.example.com/reference.jpg"
      },
      "role": "reference_image"
    }
  ],
  "resolution": "2K",
  "duration": 5,
  "ratio": "adaptive",
  "fast_mode": false
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/h3_context_ir \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Epic space-opera theatrical teaser: a female captain stands alone before a massive observation window as the last fleet gathers and jumps away in a blinding flash, the bridge shaking, leaving her behind."
    }
  ],
  "duration": 5,
  "ratio": "16:9"
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/h3_context_ir \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Pull focus to the people in the background and add more steam to the ramen bowl."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/H3_AA_I2VA/gallery/sr_v17_variants_seed42_43_20260724/inputs/4a3a90bf9100_KDmcbkhzYo5sjjxr9FqcVmWVnzb.png"
      },
      "role": "first_frame"
    }
  ],
  "duration": 5,
  "ratio": "adaptive"
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/h3_context_ir \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Character speaks: Follow the wind, live free. Leave worries behind, enjoy the moment. Voice timbre follows reference audio 1."
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/297573323635_00_%E8%A7%86%E9%A2%911_YnyRbxEwio_video_20260525_163755_1927e9d3.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/f463d523c5ce_01_%E9%9F%B3%E9%A2%911_RSLcbpzJPo_6%E6%9C%885%E6%97%A5(1).mp3"
      },
      "role": "reference_audio"
    }
  ],
  "duration": 5,
  "ratio": "adaptive"
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/video_regeneration \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "source_task_id": "424010985738629",
  "resolution": "2K"
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/video_regeneration \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "史诗级太空歌剧院线预告：女舰长独自站在巨大观景窗前，最后一支舰队正在集结并跃迁离去，强光爆闪、舰桥震动，她被留在原地。"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://your-cdn.example.com/h3-t2va-768p.mp4"
      },
      "role": "base_video"
    }
  ],
  "resolution": "2K"
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/video_regeneration \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "Pull focus to the people in the background and add more steam to the ramen bowl."
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/H3_AA_I2VA/gallery/sr_v17_variants_seed42_43_20260724/inputs/4a3a90bf9100_KDmcbkhzYo5sjjxr9FqcVmWVnzb.png"
      },
      "role": "first_frame"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://your-cdn.example.com/h3-i2va-768p.mp4"
      },
      "role": "base_video"
    }
  ],
  "resolution": "2K"
}
'

curl --request POST \
  --url https://metaso.cn/api/minimax/v2/video_regeneration \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '
{
  "model": "MiniMax-H3",
  "content": [
    {
      "type": "text",
      "text": "角色说话：Follow the wind, live free. Leave worries behind, enjoy the moment，音色参考音频1"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/297573323635_00_%E8%A7%86%E9%A2%911_YnyRbxEwio_video_20260525_163755_1927e9d3.mp4"
      },
      "role": "reference_video"
    },
    {
      "type": "audio_url",
      "audio_url": {
        "url": "https://cdn.hailuoai.com/prod/hailuo_demo/testsets/h3_promo_eval_ref2va/gallery/sr_v2p26_trio_seed42_20260724/inputs/f463d523c5ce_01_%E9%9F%B3%E9%A2%911_RSLcbpzJPo_6%E6%9C%885%E6%97%A5(1).mp3"
      },
      "role": "reference_audio"
    },
    {
      "type": "video_url",
      "video_url": {
        "url": "https://your-cdn.example.com/h3-r2va-768p.mp4"
      },
      "role": "base_video"
    }
  ],
  "resolution": "2K"
}
'

curl --request GET \
  --url https://metaso.cn/api/minimax/v2/query/video_generation/424010985738631 \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json'

{
  "task": {
    "id": "424010985738631",
    "model": "MiniMax-H3",
    "status": "running",
    "created_at": 1785126000,
    "updated_at": 1785126000,
    "resolution": "2K",
    "duration": 5,
    "usage": {},
    "ratio": "",
    "task_type": "regeneration",
    "modality": "video"
  }
}

{
  "task": {
    "id": "424010985738631",
    "model": "MiniMax-H3",
    "status": "succeeded",
    "created_at": 1785126000,
    "updated_at": 1785126300,
    "content": {
      "url": "https://your-cdn.example.com/h3-regenerated-2k-output.mp4"
    },
    "resolution": "2K",
    "duration": 5,
    "usage": {
      "total_seconds": 5,
      "input_seconds": 0,
      "output_seconds": 5,
      "input_image_count": 0
    },
    "ratio": "",
    "task_type": "regeneration",
    "modality": "video"
  }
}

curl --request GET \
  --url https://metaso.cn/api/minimax/v2/credits/balance \
  --header 'Authorization: Bearer $METASO_API_KEY' \
  --header 'Content-Type: application/json'