
const discussForm = document.getElementById("discussion-form");

if (discussForm) {
    const list = document.getElementById("discussion-list");
    const empty = document.getElementById("no-discussions");
    const search = document.getElementById("discussion-search");
    const filter = document.getElementById("discussion-filter");
    const count = document.getElementById("discussion-count");
    const result = document.getElementById("discussion-result");

    let posts = [];
    let currentUser = null;

    const postColumns =
        "id, title, topic, message, created_at, author_id, " +
        "author:profiles!ceoxb_discussions_author_id_fkey(name), " +
        "replies:ceoxb_discussion_replies(id, body, created_at, author_id, " +
        "author:profiles!ceoxb_discussion_replies_author_id_fkey(name)), " +
        "likes:ceoxb_discussion_likes(user_id)";

    function authorName(authorId, author) {
        if (currentUser && authorId === currentUser.id) {
            return "You";
        }

        return (author && author.name && author.name.trim()) || "A member";
    }

    function toPost(row) {
        const likes = row.likes || [];

        return {
            id: row.id,
            title: row.title,
            topic: row.topic,
            message: row.message,
            author: authorName(row.author_id, row.author),
            createdAt: row.created_at,
            likes: likes.length,
            liked: likes.some(function(like) {
                return like.user_id === currentUser.id;
            }),
            replies: (row.replies || [])
                .sort(function(a, b) {
                    return a.created_at.localeCompare(b.created_at);
                })
                .map(function(reply) {
                    return {
                        author: authorName(reply.author_id, reply.author),
                        text: reply.body
                    };
                })
        };
    }

    async function loadPosts() {
        const { data, error } = await _supabase
            .from("ceoxb_discussions")
            .select(postColumns)
            .order("created_at", { ascending: false });

        if (error) {
            result.textContent = "Unable to load discussions: " + error.message;
            return;
        }

        posts = (data || []).map(toPost);
        renderPosts();
    }

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    function renderPosts() {
        list.replaceChildren();

        const keyword = search.value.trim().toLowerCase();
        const selectedTopic = filter.value;

        const filtered = posts.filter(function(post) {
            const matchesTopic =
                selectedTopic === "All" ||
                post.topic === selectedTopic;

            const content = (
                post.title + " " +
                post.message + " " +
                post.topic
            ).toLowerCase();

            return matchesTopic && content.includes(keyword);
        });

        count.textContent =
            posts.length + (posts.length === 1
                ? " discussion"
                : " discussions");

        empty.hidden = filtered.length > 0;

        filtered.forEach(function(post) {
            const card = makeElement("article", "discussion-card");

            const top = makeElement("div", "discussion-card-top");

            const topic = makeElement(
                "span",
                "discussion-category",
                post.topic
            );

            const date = makeElement(
                "span",
                "discussion-date",
                new Date(post.createdAt).toLocaleDateString()
            );

            const author = makeElement(
                "span",
                "discussion-author",
                "Posted by " + (post.author || "You")
            );

            top.append(topic, author, date);

            const title = makeElement(
                "h3",
                "discussion-card-title",
                post.title
            );

            const message = makeElement(
                "p",
                "discussion-card-message",
                post.message
            );

            const actions = makeElement(
                "div",
                "discussion-card-actions"
            );

            const likeButton = makeElement(
                "button",
                "discussion-action",
                (post.liked ? "♥ " : "♡ ") + post.likes + " Likes"
            );

            likeButton.type = "button";

            if (post.liked) {
                likeButton.classList.add("liked");
            }

            likeButton.addEventListener("click", async function() {
                likeButton.disabled = true;

                const request = post.liked
                    ? _supabase
                        .from("ceoxb_discussion_likes")
                        .delete()
                        .eq("discussion_id", post.id)
                        .eq("user_id", currentUser.id)
                    : _supabase
                        .from("ceoxb_discussion_likes")
                        .insert({ discussion_id: post.id });

                const { error } = await request;

                if (error) {
                    likeButton.disabled = false;
                    result.textContent = "Unable to update like: " + error.message;
                    return;
                }

                post.liked = !post.liked;
                post.likes += post.liked ? 1 : -1;
                renderPosts();
            });

            const replyButton = makeElement(
                "button",
                "discussion-action",
                "Reply · " + post.replies.length
            );

            replyButton.type = "button";

            const replies = makeElement(
                "div",
                "discussion-replies"
            );

            replies.hidden = true;

            post.replies.forEach(function(reply) {
                const item = makeElement(
                    "div",
                    "discussion-reply"
                );

                const author = makeElement(
                    "strong",
                    "",
                    reply.author
                );

                const text = makeElement(
                    "p",
                    "",
                    reply.text
                );

                item.append(author, text);
                replies.appendChild(item);
            });

            const replyForm = makeElement(
                "form",
                "discussion-reply-form"
            );

            const replyInput = makeElement("input", "");
            replyInput.type = "text";
            replyInput.placeholder = "Write a reply...";
            replyInput.maxLength = 500;
            replyInput.required = true;
            replyInput.setAttribute("aria-label", "Write a reply");

            const sendButton = makeElement(
                "button",
                "",
                "Reply"
            );

            sendButton.type = "submit";

            replyForm.append(replyInput, sendButton);
            replies.appendChild(replyForm);

            replyButton.addEventListener("click", function() {
                replies.hidden = !replies.hidden;
            });

            replyForm.addEventListener("submit", async function(event) {
                event.preventDefault();

                const text = replyInput.value.trim();

                if (!text) {
                    return;
                }

                sendButton.disabled = true;

                const { error } = await _supabase
                    .from("ceoxb_discussion_replies")
                    .insert({ discussion_id: post.id, body: text });

                if (error) {
                    sendButton.disabled = false;
                    result.textContent = "Unable to post reply: " + error.message;
                    return;
                }

                post.replies.push({
                    author: "You",
                    text: text
                });

                renderPosts();
            });

            actions.append(likeButton, replyButton);

            card.append(
                top,
                title,
                message,
                actions,
                replies
            );

            list.appendChild(card);
        });
    }

    discussForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        if (!currentUser) {
            result.textContent = "Please sign in to post.";
            return;
        }

        const title = document.getElementById(
            "discussion-title"
        ).value.trim();

        const topic = document.getElementById(
            "discussion-topic"
        ).value;

        const message = document.getElementById(
            "discussion-message"
        ).value.trim();

        if (!title || !topic || !message) {
            result.textContent = "Please complete all fields.";
            return;
        }

        result.textContent = "Posting...";

        const { data, error } = await _supabase
            .from("ceoxb_discussions")
            .insert({ title: title, topic: topic, message: message })
            .select(postColumns)
            .single();

        if (error) {
            result.textContent = "Unable to post discussion: " + error.message;
            return;
        }

        posts.unshift(toPost(data));
        discussForm.reset();

        search.value = "";
        filter.value = "All";

        result.textContent = "Discussion posted successfully!";
        renderPosts();
    });

    search.addEventListener("input", renderPosts);
    filter.addEventListener("change", renderPosts);

    async function initializeDiscussions() {
        currentUser = await getCurrentUser();

        if (!currentUser) {
            return;
        }

        await loadPosts();
    }
    initializeDiscussions();
}
