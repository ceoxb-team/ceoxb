
const discussForm = document.getElementById("discussion-form");

if (discussForm) {
    const list = document.getElementById("discussion-list");
    const empty = document.getElementById("no-discussions");
    const search = document.getElementById("discussion-search");
    const filter = document.getElementById("discussion-filter");
    const count = document.getElementById("discussion-count");
    const result = document.getElementById("discussion-result");

    let posts = [];
    let storageKey = "";

    function savePosts() {
        localStorage.setItem(storageKey, JSON.stringify(posts));
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

            likeButton.addEventListener("click", function() {
                post.liked = !post.liked;
                post.likes += post.liked ? 1 : -1;
                savePosts();
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

            replyForm.addEventListener("submit", function(event) {
                event.preventDefault();

                const text = replyInput.value.trim();

                if (!text) {
                    return;
                }

                post.replies.push({
                    author: "You",
                    text: text
                });

                savePosts();
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

    discussForm.addEventListener("submit", function(event) {
        event.preventDefault();

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

        posts.unshift({
            id: crypto.randomUUID(),
            title: title,
            topic: topic,
            message: message,
            author: "You",
            createdAt: new Date().toISOString(),
            likes: 0,
            liked: false,
            replies: []
        });

        savePosts();
        discussForm.reset();

        search.value = "";
        filter.value = "All";

        result.textContent = "Discussion posted successfully!";
        renderPosts();
    });

    search.addEventListener("input", renderPosts);
    filter.addEventListener("change", renderPosts);

    async function initializeDiscussions() {
        const user = await getCurrentUser();

        if (!user) {
            return;
        }

        storageKey = "ceoxb-discussions-" + user.id;

        try {
            const saved = JSON.parse(
                localStorage.getItem(storageKey) || "[]"
            );

            posts = Array.isArray(saved) ? saved : [];
        } catch (error) {
            posts = [];
        }

        renderPosts();
    }
    initializeDiscussions();
}
